-- PETSHOP TOPTAN SATIŞ İŞLETME YÖNETİM SİSTEMİ
-- Database Schema & RLS Policies & Stored Procedures Migration (Production Ready)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  business_name TEXT DEFAULT 'Petshop Toptan Satış',
  phone TEXT,
  address TEXT,
  default_payment_term_days INT DEFAULT 30 CHECK (default_payment_term_days > 0),
  default_min_stock INT DEFAULT 10 CHECK (default_min_stock >= 0),
  currency_symbol TEXT DEFAULT 'TL',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for auto profile creation on Auth Sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, business_name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', new.email), 'Petshop Toptan Satış')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. SUPPLIERS TABLE
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 3. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  barcode TEXT,
  unit TEXT DEFAULT 'Adet',
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (purchase_price >= 0),
  sale_price NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (sale_price >= 0),
  current_stock NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (current_stock >= 0),
  minimum_stock NUMERIC(12,2) NOT NULL DEFAULT 10.00 CHECK (minimum_stock >= 0),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 5. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_number TEXT,
  tax_office TEXT,
  payment_term_days INT DEFAULT 30 CHECK (payment_term_days > 0),
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 6. SALES TABLE
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sale_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_cost >= 0),
  total_profit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  payment_type TEXT NOT NULL DEFAULT 'vadeli', -- pesin, vadeli
  term_days INT DEFAULT 30,
  due_date DATE,
  status TEXT DEFAULT 'pending', -- paid, pending, partially_paid, cancelled
  paid_amount NUMERIC(12,2) DEFAULT 0.00 CHECK (paid_amount >= 0),
  remaining_debt NUMERIC(12,2) DEFAULT 0.00 CHECK (remaining_debt >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 7. SALE_ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  unit TEXT DEFAULT 'Adet',
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1.00 CHECK (quantity > 0),
  purchase_price_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (purchase_price_snapshot >= 0),
  sale_price_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (sale_price_snapshot >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_cost >= 0),
  total_profit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 8. STOCK_MOVEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL, -- PURCHASE, SALE, RETURN, ADJUSTMENT, DAMAGE, INITIAL
  quantity NUMERIC(12,2) NOT NULL,
  unit_cost NUMERIC(12,2) DEFAULT 0.00 CHECK (unit_cost >= 0),
  reference_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 9. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'Nakit', -- Nakit, Havale/EFT, Diğer
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 10. CUSTOMER_LEDGER TABLE
CREATE TABLE IF NOT EXISTS public.customer_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL, -- BORÇ, ÖDEME, İADE, DÜZELTME
  description TEXT NOT NULL,
  debit NUMERIC(12,2) DEFAULT 0.00 CHECK (debit >= 0),  -- Borç (Satış)
  credit NUMERIC(12,2) DEFAULT 0.00 CHECK (credit >= 0), -- Ödeme
  balance NUMERIC(12,2) DEFAULT 0.00, -- Güncel Borç Bakiyesi
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 11. PAYMENT_SCHEDULES TABLE
CREATE TABLE IF NOT EXISTS public.payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0),
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
  remaining_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (remaining_amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, partially_paid, paid, overdue
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 12. PROFIT_TARGETS TABLE
CREATE TABLE IF NOT EXISTS public.profit_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INT NOT NULL CHECK (year >= 2024),
  target_profit NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (target_profit >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_owner_month_year UNIQUE (owner_id, month, year)
);

-- 13. AUDIT_LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_products_owner ON public.products(owner_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_customers_owner ON public.customers(owner_id);
CREATE INDEX IF NOT EXISTS idx_sales_owner ON public.sales(owner_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_prod ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON public.customer_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_due ON public.payment_schedules(due_date);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_sale ON public.payment_schedules(sale_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON public.payments(customer_id);

-- ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES FOR ALL TABLES (OWNER ACCESS ONLY)
CREATE POLICY "Users can manage their own profile" ON public.profiles FOR ALL USING (id = auth.uid());
CREATE POLICY "Users can manage their own suppliers" ON public.suppliers FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users can manage their own categories" ON public.categories FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users can manage their own products" ON public.products FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users can manage their own customers" ON public.customers FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users can manage their own sales" ON public.sales FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users can manage their own sale items" ON public.sale_items FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users can manage their own stock movements" ON public.stock_movements FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users can manage their own payments" ON public.payments FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users can manage their own customer ledger" ON public.customer_ledger FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users can manage their own payment schedules" ON public.payment_schedules FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users can manage their own profit targets" ON public.profit_targets FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Users can manage their own audit logs" ON public.audit_logs FOR ALL USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- ATOMIC STORED PROCEDURES (RPCs) FOR BUSINESS TRANSACTIONS
-- ----------------------------------------------------------------------------

-- 1. ATOMIC SALE TRANSACTION PROCEDURE
CREATE OR REPLACE FUNCTION public.create_sale_transaction(
  p_customer_id UUID,
  p_payment_type TEXT,
  p_term_days INT,
  p_due_date DATE,
  p_notes TEXT,
  p_items JSONB, -- Array of objects: [{product_id, quantity, sale_price}]
  p_schedules JSONB DEFAULT NULL -- Array of objects: [{due_date, amount}]
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_customer_name TEXT;
  v_sale_id UUID;
  v_sale_number TEXT;
  v_item JSONB;
  v_product RECORD;
  v_prod_id UUID;
  v_qty NUMERIC(12,2);
  v_unit_sale_price NUMERIC(12,2);
  v_unit_cost NUMERIC(12,2);
  v_item_total NUMERIC(12,2);
  v_item_cost NUMERIC(12,2);
  v_item_profit NUMERIC(12,2);
  v_total_amount NUMERIC(12,2) := 0.00;
  v_total_cost NUMERIC(12,2) := 0.00;
  v_total_profit NUMERIC(12,2) := 0.00;
  v_prev_balance NUMERIC(12,2) := 0.00;
  v_new_balance NUMERIC(12,2) := 0.00;
  v_sched JSONB;
  v_sched_due DATE;
  v_sched_amt NUMERIC(12,2);
  v_sched_sum NUMERIC(12,2) := 0.00;
  v_status TEXT;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum açmış kullanıcı bulunamadı.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Satış en az 1 ürün içermelidir.';
  END IF;

  -- Customer check
  SELECT business_name INTO v_customer_name
  FROM public.customers
  WHERE id = p_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'Müşteri bulunamadı veya silinmiş.';
  END IF;

  -- Generate unique sale number e.g. SAT-YYYYMMDD-XXXX
  v_sale_number := 'SAT-' || to_char(NOW(), 'YYYYMMDD') || '-' || lpad(floor(random() * 10000)::text, 4, '0');
  v_status := CASE WHEN p_payment_type = 'pesin' THEN 'paid' ELSE 'pending' END;

  -- Create sales master entry
  INSERT INTO public.sales (
    owner_id, sale_number, customer_id, customer_name, total_amount, total_cost, total_profit,
    payment_type, term_days, due_date, status, paid_amount, remaining_debt, notes
  ) VALUES (
    v_owner_id, v_sale_number, p_customer_id, v_customer_name, 0, 0, 0,
    p_payment_type, p_term_days, p_due_date, v_status,
    CASE WHEN p_payment_type = 'pesin' THEN 0 ELSE 0 END,
    0, p_notes
  ) RETURNING id INTO v_sale_id;

  -- Process items array
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_unit_sale_price := (v_item->>'sale_price')::NUMERIC;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Satış miktarı 0 veya negatif olamaz.';
    END IF;

    IF v_unit_sale_price < 0 THEN
      RAISE EXCEPTION 'Satış fiyatı negatif olamaz.';
    END IF;

    SELECT * INTO v_product FROM public.products
    WHERE id = v_prod_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Ürün bulunamadı (ID: %)', v_prod_id;
    END IF;

    IF v_product.current_stock < v_qty THEN
      RAISE EXCEPTION 'Yetersiz stok: % ürünü için mevcut stok %, istenen %', v_product.product_name, v_product.current_stock, v_qty;
    END IF;

    v_unit_cost := v_product.purchase_price;
    v_item_total := ROUND(v_qty * v_unit_sale_price, 2);
    v_item_cost := ROUND(v_qty * v_unit_cost, 2);
    v_item_profit := v_item_total - v_item_cost;

    v_total_amount := v_total_amount + v_item_total;
    v_total_cost := v_total_cost + v_item_cost;
    v_total_profit := v_total_profit + v_item_profit;

    -- Insert sale item snapshot
    INSERT INTO public.sale_items (
      owner_id, sale_id, product_id, product_name, unit, quantity,
      purchase_price_snapshot, sale_price_snapshot, total_amount, total_cost, total_profit
    ) VALUES (
      v_owner_id, v_sale_id, v_prod_id, v_product.product_name, v_product.unit, v_qty,
      v_unit_cost, v_unit_sale_price, v_item_total, v_item_cost, v_item_profit
    );

    -- Reduce product stock
    UPDATE public.products
    SET current_stock = current_stock - v_qty,
        updated_at = NOW()
    WHERE id = v_prod_id;

    -- Create stock movement record
    INSERT INTO public.stock_movements (
      owner_id, product_id, movement_type, quantity, unit_cost, reference_id, note
    ) VALUES (
      v_owner_id, v_prod_id, 'SALE', v_qty, v_unit_cost, v_sale_id, 'Satış #' || v_sale_number
    );
  END LOOP;

  -- Validate payment schedules sum if vadeli
  IF p_payment_type = 'vadeli' AND p_schedules IS NOT NULL AND jsonb_array_length(p_schedules) > 0 THEN
    v_sched_sum := 0.00;
    FOR v_sched IN SELECT * FROM jsonb_array_elements(p_schedules)
    LOOP
      v_sched_sum := v_sched_sum + (v_sched->>'amount')::NUMERIC;
    END LOOP;

    IF ABS(v_sched_sum - v_total_amount) > 0.05 THEN
      RAISE EXCEPTION 'Taksit ödeme planı toplamı (%) satış tutarına (%) eşit olmalıdır.', v_sched_sum, v_total_amount;
    END IF;
  END IF;

  -- Update master sale totals
  UPDATE public.sales
  SET total_amount = v_total_amount,
      total_cost = v_total_cost,
      total_profit = v_total_profit,
      remaining_debt = CASE WHEN p_payment_type = 'vadeli' THEN v_total_amount ELSE 0 END,
      paid_amount = CASE WHEN p_payment_type = 'pesin' THEN v_total_amount ELSE 0 END
  WHERE id = v_sale_id;

  -- Handle customer ledger & payment schedules
  IF p_payment_type = 'vadeli' THEN
    SELECT COALESCE(balance, 0.00) INTO v_prev_balance
    FROM public.customer_ledger
    WHERE customer_id = p_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 1;

    v_new_balance := v_prev_balance + v_total_amount;

    INSERT INTO public.customer_ledger (
      owner_id, customer_id, sale_id, movement_type, description, debit, credit, balance
    ) VALUES (
      v_owner_id, p_customer_id, v_sale_id, 'BORÇ', 'Vadeli Satış #' || v_sale_number, v_total_amount, 0, v_new_balance
    );

    IF p_schedules IS NOT NULL AND jsonb_array_length(p_schedules) > 0 THEN
      FOR v_sched IN SELECT * FROM jsonb_array_elements(p_schedules)
      LOOP
        v_sched_due := (v_sched->>'due_date')::DATE;
        v_sched_amt := (v_sched->>'amount')::NUMERIC;
        INSERT INTO public.payment_schedules (
          owner_id, customer_id, sale_id, due_date, amount, paid_amount, remaining_amount, status
        ) VALUES (
          v_owner_id, p_customer_id, v_sale_id, v_sched_due, v_sched_amt, 0, v_sched_amt, 'pending'
        );
      END LOOP;
    ELSE
      INSERT INTO public.payment_schedules (
        owner_id, customer_id, sale_id, due_date, amount, paid_amount, remaining_amount, status
      ) VALUES (
        v_owner_id, p_customer_id, v_sale_id, COALESCE(p_due_date, CURRENT_DATE + INTERVAL '30 days'), v_total_amount, 0, v_total_amount, 'pending'
      );
    END IF;
  ELSE
    SELECT COALESCE(balance, 0.00) INTO v_prev_balance
    FROM public.customer_ledger
    WHERE customer_id = p_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 1;

    INSERT INTO public.customer_ledger (
      owner_id, customer_id, sale_id, movement_type, description, debit, credit, balance
    ) VALUES (
      v_owner_id, p_customer_id, v_sale_id, 'BORÇ', 'Peşin Satış #' || v_sale_number, v_total_amount, 0, v_prev_balance + v_total_amount
    );

    INSERT INTO public.customer_ledger (
      owner_id, customer_id, sale_id, movement_type, description, debit, credit, balance
    ) VALUES (
      v_owner_id, p_customer_id, v_sale_id, 'ÖDEME', 'Peşin Tahsilat #' || v_sale_number, 0, v_total_amount, v_prev_balance
    );
  END IF;

  -- Create Audit log
  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'CREATE_SALE', 'sales', v_sale_id,
    jsonb_build_object('sale_number', v_sale_number, 'total_amount', v_total_amount, 'customer_name', v_customer_name, 'payment_type', p_payment_type)
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'total_amount', v_total_amount,
    'total_profit', v_total_profit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. ATOMIC PROCESS PAYMENT TRANSACTION PROCEDURE
CREATE OR REPLACE FUNCTION public.process_payment_transaction(
  p_customer_id UUID,
  p_amount NUMERIC(12,2),
  p_payment_method TEXT,
  p_notes TEXT
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_payment_id UUID;
  v_customer_name TEXT;
  v_prev_balance NUMERIC(12,2) := 0.00;
  v_new_balance NUMERIC(12,2) := 0.00;
  v_rem_pay NUMERIC(12,2);
  v_sched RECORD;
  v_apply NUMERIC(12,2);
  v_new_paid NUMERIC(12,2);
  v_new_rem NUMERIC(12,2);
  v_sched_status TEXT;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum açmış kullanıcı bulunamadı.';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Tahsilat tutarı 0 veya negatif olamaz.';
  END IF;

  SELECT business_name INTO v_customer_name
  FROM public.customers
  WHERE id = p_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL;

  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'Müşteri bulunamadı.';
  END IF;

  -- Create payment entry
  INSERT INTO public.payments (
    owner_id, customer_id, amount, payment_method, payment_date, notes
  ) VALUES (
    v_owner_id, p_customer_id, p_amount, p_payment_method, CURRENT_DATE, p_notes
  ) RETURNING id INTO v_payment_id;

  -- Ledger balance update
  SELECT COALESCE(balance, 0.00) INTO v_prev_balance
  FROM public.customer_ledger
  WHERE customer_id = p_customer_id AND owner_id = v_owner_id AND deleted_at IS NULL
  ORDER BY created_at DESC LIMIT 1;

  v_new_balance := v_prev_balance - p_amount;

  INSERT INTO public.customer_ledger (
    owner_id, customer_id, payment_id, movement_type, description, debit, credit, balance
  ) VALUES (
    v_owner_id, p_customer_id, v_payment_id, 'ÖDEME', 'Tahsilat (' || p_payment_method || ')', 0, p_amount, v_new_balance
  );

  -- Distribute payment to pending/partially_paid/overdue payment schedules ordered by due_date ASC
  v_rem_pay := p_amount;

  FOR v_sched IN
    SELECT * FROM public.payment_schedules
    WHERE customer_id = p_customer_id AND owner_id = v_owner_id AND status IN ('pending', 'partially_paid', 'overdue') AND deleted_at IS NULL
    ORDER BY due_date ASC, created_at ASC FOR UPDATE
  LOOP
    EXIT WHEN v_rem_pay <= 0;

    v_apply := LEAST(v_rem_pay, v_sched.remaining_amount);
    v_new_paid := v_sched.paid_amount + v_apply;
    v_new_rem := v_sched.remaining_amount - v_apply;

    IF v_new_rem = 0 THEN
      v_sched_status := 'paid';
    ELSE
      v_sched_status := 'partially_paid';
    END IF;

    UPDATE public.payment_schedules
    SET paid_amount = v_new_paid,
        remaining_amount = v_new_rem,
        status = v_sched_status,
        paid_at = CASE WHEN v_new_rem = 0 THEN NOW() ELSE paid_at END
    WHERE id = v_sched.id;

    -- Update parent sale paid_amount and status
    UPDATE public.sales
    SET paid_amount = paid_amount + v_apply,
        remaining_debt = GREATEST(0, remaining_debt - v_apply),
        status = CASE WHEN (remaining_debt - v_apply) <= 0 THEN 'paid' ELSE 'partially_paid' END
    WHERE id = v_sched.sale_id;

    v_rem_pay := v_rem_pay - v_apply;
  END LOOP;

  -- Create Audit log
  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'CREATE_PAYMENT', 'payments', v_payment_id,
    jsonb_build_object('customer_name', v_customer_name, 'amount', p_amount, 'payment_method', p_payment_method)
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. ATOMIC STOCK ENTRY / ADJUSTMENT TRANSACTION PROCEDURE
CREATE OR REPLACE FUNCTION public.stock_entry_transaction(
  p_product_id UUID,
  p_movement_type TEXT, -- PURCHASE, ADJUSTMENT, RETURN, DAMAGE
  p_quantity NUMERIC(12,2),
  p_unit_cost NUMERIC(12,2) DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_owner_id UUID;
  v_product RECORD;
  v_new_stock NUMERIC(12,2);
  v_cost NUMERIC(12,2);
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Oturum açmış kullanıcı bulunamadı.';
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'İşlem miktarı 0 veya negatif olamaz.';
  END IF;

  IF p_unit_cost IS NOT NULL AND p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Birim alış fiyatı negatif olamaz.';
  END IF;

  SELECT * INTO v_product FROM public.products
  WHERE id = p_product_id AND owner_id = v_owner_id AND deleted_at IS NULL FOR UPDATE;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Ürün bulunamadı.';
  END IF;

  v_cost := COALESCE(p_unit_cost, v_product.purchase_price);

  IF p_movement_type IN ('PURCHASE', 'RETURN', 'INITIAL') THEN
    v_new_stock := v_product.current_stock + p_quantity;
  ELSIF p_movement_type IN ('DAMAGE') THEN
    IF v_product.current_stock < p_quantity THEN
      RAISE EXCEPTION 'Zayiat düşülecek stok miktarı mevcut stoktan ( % ) büyük olamaz.', v_product.current_stock;
    END IF;
    v_new_stock := v_product.current_stock - p_quantity;
  ELSIF p_movement_type = 'ADJUSTMENT' THEN
    v_new_stock := p_quantity; -- Absolute count set
  ELSE
    RAISE EXCEPTION 'Geçersiz stok hareket tipi: %', p_movement_type;
  END IF;

  -- Update product current stock and optional unit cost if purchase
  UPDATE public.products
  SET current_stock = v_new_stock,
      purchase_price = CASE WHEN p_movement_type = 'PURCHASE' AND p_unit_cost IS NOT NULL AND p_unit_cost > 0 THEN p_unit_cost ELSE purchase_price END,
      updated_at = NOW()
  WHERE id = p_product_id;

  -- Insert movement log
  INSERT INTO public.stock_movements (
    owner_id, product_id, movement_type, quantity, unit_cost, note
  ) VALUES (
    v_owner_id, p_product_id, p_movement_type, p_quantity, v_cost, p_note
  );

  -- Audit log
  INSERT INTO public.audit_logs (
    owner_id, action, entity_type, entity_id, details
  ) VALUES (
    v_owner_id, 'STOCK_MOVEMENT', 'products', p_product_id,
    jsonb_build_object(
      'product_name', v_product.product_name,
      'movement_type', p_movement_type,
      'old_stock', v_product.current_stock,
      'new_stock', v_new_stock,
      'quantity', p_quantity,
      'note', p_note
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'new_stock', v_new_stock
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
