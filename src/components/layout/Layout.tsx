import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { NewSaleModal } from '@/components/modals/NewSaleModal';
import { PaymentModal } from '@/components/modals/PaymentModal';
import { StockEntryModal } from '@/components/modals/StockEntryModal';
import { SaleDocumentModal } from '@/components/modals/SaleDocumentModal';
import { CustomerStatementModal } from '@/components/modals/CustomerStatementModal';

export interface LayoutContextType {
  openNewSaleModal: () => void;
  openPaymentModal: (customerId?: string) => void;
  openStockEntryModal: (productId?: string) => void;
  openSaleDocumentModal: (saleId: string) => void;
  openCustomerStatementModal: (customerId: string) => void;
}

export const Layout: React.FC = () => {
  const [newSaleOpen, setNewSaleOpen] = useState(false);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentCustomerId, setPaymentCustomerId] = useState<string | undefined>();

  const [stockEntryOpen, setStockEntryOpen] = useState(false);
  const [stockProductId, setStockProductId] = useState<string | undefined>();

  const [saleDocumentOpen, setSaleDocumentOpen] = useState(false);
  const [activeSaleDocumentId, setActiveSaleDocumentId] = useState<string | null>(null);

  const [customerStatementOpen, setCustomerStatementOpen] = useState(false);
  const [activeCustomerStatementId, setActiveCustomerStatementId] = useState<string | null>(null);

  const openNewSaleModal = () => setNewSaleOpen(true);

  const openPaymentModal = (customerId?: string) => {
    setPaymentCustomerId(customerId);
    setPaymentOpen(true);
  };

  const openStockEntryModal = (productId?: string) => {
    setStockProductId(productId);
    setStockEntryOpen(true);
  };

  const openSaleDocumentModal = (saleId: string) => {
    setActiveSaleDocumentId(saleId);
    setSaleDocumentOpen(true);
  };

  const openCustomerStatementModal = (customerId: string) => {
    setActiveCustomerStatementId(customerId);
    setCustomerStatementOpen(true);
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Desktop Left Sidebar */}
      <Sidebar onOpenNewSaleModal={openNewSaleModal} />

      {/* Main Content Body */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0">
        <Header
          onOpenNewSale={openNewSaleModal}
          onOpenPayment={() => openPaymentModal()}
          onOpenStockEntry={() => openStockEntryModal()}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet
            context={{
              openNewSaleModal,
              openPaymentModal,
              openStockEntryModal,
              openSaleDocumentModal,
              openCustomerStatementModal,
            }}
          />
        </main>
      </div>

      {/* Mobile Navigation Bar */}
      <BottomNav />

      {/* Global Action Modals */}
      <NewSaleModal
        isOpen={newSaleOpen}
        onClose={() => setNewSaleOpen(false)}
        onSuccess={(createdSaleId) => {
          window.dispatchEvent(new Event('refresh-data'));
          if (createdSaleId) {
            openSaleDocumentModal(createdSaleId);
          }
        }}
      />

      <PaymentModal
        isOpen={paymentOpen}
        defaultCustomerId={paymentCustomerId}
        onClose={() => setPaymentOpen(false)}
        onSuccess={() => {
          window.dispatchEvent(new Event('refresh-data'));
        }}
      />

      <StockEntryModal
        isOpen={stockEntryOpen}
        defaultProductId={stockProductId}
        onClose={() => setStockEntryOpen(false)}
        onSuccess={() => {
          window.dispatchEvent(new Event('refresh-data'));
        }}
      />

      {/* Document Modals */}
      <SaleDocumentModal
        isOpen={saleDocumentOpen}
        onClose={() => setSaleDocumentOpen(false)}
        saleId={activeSaleDocumentId}
      />

      <CustomerStatementModal
        isOpen={customerStatementOpen}
        onClose={() => setCustomerStatementOpen(false)}
        customerId={activeCustomerStatementId}
      />
    </div>
  );
};
