-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- MIGRATION: 20260815050000_fix_supplier_ledger_balance_calculation.sql
-- TEDARİKÇİ CARİ BORÇ HESAPLAMA, STOK GİRİŞİ BORÇ SENKRONİZASYONU VE BAKİYE YENİDEN HESAPLAMA DÜZELTMESİ

-- 1. TEDARİKÇİ BAKİYELERİNİ KRONOLOJİK OLARAK YENİDEN HESAPLAYAN RECALCULATE SAKLI YORDAMI
CREATE OR REPLACE FUNCTION public.recalculate_all_supplier_ledger_balances()
RETURNS void AS $$
DECLARE
  v_sup RECORD;
  v_ledger RECORD;
  v_running_bal NUMERIC(12,2);
BEGIN
  FOR v_sup IN SELECT DISTINCT supplier_id FROM public.supplier_ledger WHERE deleted_at IS NULL LOOP
    v_running_bal := 0.00;

    FOR v_ledger IN
      SELECT id, debit, credit
      FROM public.supplier_ledger
      WHERE supplier_id = v_sup.supplier_id AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
    LOOP
      v_running_bal := v_running_bal + COALESCE(v_ledger.credit, 0.00) - COALESCE(v_ledger.debit, 0.00);

      UPDATE public.supplier_ledger
      SET balance = v_running_bal
      WHERE id = v_ledger.id;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.recalculate_all_supplier_ledger_balances() TO authenticated;


-- 2. GÜNCELLENMİŞ BATCH_STOCK_ENTRY_TRANSACTION SAKLI YORDAMI
CREATE OR REPLACE FUNCTION public.batch_stock_entry_transaction(
  p_supplier_id UUID,
  p_purchase_type TEXT,
  p_note TEXT,
  p_items JSONB
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_supplier_name TEXT;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_cost NUMERIC;
  v_sale_price NUMERIC;
  v_product RECORD;
  v_new_stock NUMERIC;
  v_item_cost NUMERIC;
  v_item_total NUMERIC;
  v_batch_total NUMERIC := 0.00;
  v_sup_prev_balance NUMERIC := 0.00;
  v_sup_new_balance NUMERIC := 0.00;
  v_movement_id UUID;
  v_processed_count INT := 0;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı veya yetkisiz erişim.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Mal girişi için en az 1 ürün eklenmelidir.';
  END IF;

  IF p_supplier_id IS NOT NULL THEN
    SELECT company_name INTO v_supplier_name
    FROM public.suppliers
    WHERE id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL;

    IF v_supplier_name IS NULL THEN
      RAISE EXCEPTION 'Seçilen tedarikçi bulunamadı.';
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := (v_item->>'unit_cost')::NUMERIC;
    v_sale_price := (v_item->>'sale_price')::NUMERIC;

    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Geçersiz ürün veya miktar bilgisi.';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Ürün bulunamadı (ID: %)', v_product_id;
    END IF;

    v_item_cost := COALESCE(v_unit_cost, v_product.purchase_price);
    IF v_item_cost < 0 THEN
      RAISE EXCEPTION 'Birim alış fiyatı negatif olamaz.';
    END IF;

    v_new_stock := v_product.current_stock + v_quantity;
    v_item_total := ROUND(v_quantity * v_item_cost, 2);
    v_batch_total := v_batch_total + v_item_total;

    UPDATE public.products
    SET current_stock = v_new_stock,
        purchase_price = CASE WHEN v_item_cost > 0 THEN v_item_cost ELSE purchase_price END,
        sale_price = CASE WHEN v_sale_price IS NOT NULL AND v_sale_price > 0 THEN v_sale_price ELSE sale_price END,
        updated_at = NOW()
    WHERE id = v_product_id;

    INSERT INTO public.stock_movements (
      owner_id, product_id, supplier_id, movement_type, quantity, unit_cost, note
    ) VALUES (
      v_owner_id, v_product_id, p_supplier_id, 'PURCHASE', v_quantity, v_item_cost, p_note
    ) RETURNING id INTO v_movement_id;

    v_processed_count := v_processed_count + 1;
  END LOOP;

  -- TEDARİKÇİ CARİ BORÇ KAYDININ ATOMİK OLARAK İŞLENMESİ
  IF p_supplier_id IS NOT NULL AND v_batch_total > 0 THEN
    -- Gerçek net bakiye toplamını hesapla: SUM(credit) - SUM(debit)
    SELECT COALESCE(SUM(credit) - SUM(debit), 0.00) INTO v_sup_prev_balance
    FROM public.supplier_ledger
    WHERE supplier_id = p_supplier_id AND owner_id = v_owner_id AND deleted_at IS NULL;

    IF v_sup_prev_balance < 0 THEN
      v_sup_prev_balance := 0.00;
    END IF;

    v_sup_new_balance := v_sup_prev_balance + v_batch_total;

    INSERT INTO public.supplier_ledger (
      owner_id, supplier_id, movement_type, description, debit, credit, balance, reference_id
    ) VALUES (
      v_owner_id,
      p_supplier_id,
      'PURCHASE',
      'Mal Alımı (' || v_processed_count || ' Kalem Ürün - Toplam Alış: ' || v_batch_total || ' TL)',
      0.00,
      v_batch_total,
      v_sup_new_balance,
      v_movement_id
    );

    PERFORM public.recalculate_all_supplier_ledger_balances();
  END IF;

  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'BATCH_STOCK_INTAKE', 'stock_movements', p_supplier_id,
    jsonb_build_object(
      'supplier_id', p_supplier_id,
      'supplier_name', v_supplier_name,
      'items_count', v_processed_count,
      'total_batch_cost', v_batch_total,
      'debt_added', v_batch_total,
      'new_supplier_balance', v_sup_new_balance,
      'note', p_note
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'items_processed', v_processed_count,
    'total_batch_cost', v_batch_total,
    'debt_added', v_batch_total,
    'new_supplier_balance', v_sup_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.batch_stock_entry_transaction(UUID, TEXT, TEXT, JSONB) TO authenticated;

-- Tüm tedarikçi cari bakiyelerini kronolojik sırayla tam olarak güncelle
SELECT public.recalculate_all_supplier_ledger_balances();
