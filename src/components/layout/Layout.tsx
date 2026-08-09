import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';

// Global Modal Trigger Context or Props
export interface LayoutContextType {
  openNewSaleModal: () => void;
  openPaymentModal: (customerId?: string) => void;
  openStockEntryModal: (productId?: string) => void;
}

export const Layout: React.FC = () => {
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentCustomerId, setPaymentCustomerId] = useState<string | undefined>();
  const [stockEntryOpen, setStockEntryOpen] = useState(false);
  const [stockProductId, setStockProductId] = useState<string | undefined>();

  const openNewSaleModal = () => setNewSaleOpen(true);
  const openPaymentModal = (customerId?: string) => {
    setPaymentCustomerId(customerId);
    setPaymentOpen(true);
  };
  const openStockEntryModal = (productId?: string) => {
    setStockProductId(productId);
    setStockEntryOpen(true);
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
              newSaleOpen,
              setNewSaleOpen,
              paymentOpen,
              setPaymentOpen,
              paymentCustomerId,
              stockEntryOpen,
              setStockEntryOpen,
              stockProductId,
            }}
          />
        </main>
      </div>

      {/* Mobile Navigation Bar */}
      <BottomNav />
    </div>
  );
};
