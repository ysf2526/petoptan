import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useOutletContext } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { Layout, LayoutContextType } from '@/components/layout/Layout';

// Pages
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Sales } from '@/pages/Sales';
import { Products } from '@/pages/Products';
import { StockMovements } from '@/pages/StockMovements';
import { Customers } from '@/pages/Customers';
import { CustomerDetail } from '@/pages/CustomerDetail';
import { Ledger } from '@/pages/Ledger';
import { Collections } from '@/pages/Collections';
import { Suppliers } from '@/pages/Suppliers';
import { ProfitTargets } from '@/pages/ProfitTargets';
import { Reports } from '@/pages/Reports';
import { AuditLogs } from '@/pages/AuditLogs';
import { Settings } from '@/pages/Settings';

// Global Modals
import { NewSaleModal } from '@/components/modals/NewSaleModal';
import { PaymentModal } from '@/components/modals/PaymentModal';
import { StockEntryModal } from '@/components/modals/StockEntryModal';

const GlobalModalContainer: React.FC = () => {
  const ctx = useOutletContext<any>();
  if (!ctx) return null;

  return (
    <>
      <NewSaleModal
        isOpen={ctx.newSaleOpen || false}
        onClose={() => ctx.setNewSaleOpen(false)}
        onSuccess={() => {
          // Trigger page refresh if needed
          window.dispatchEvent(new Event('refresh-data'));
        }}
      />

      <PaymentModal
        isOpen={ctx.paymentOpen || false}
        defaultCustomerId={ctx.paymentCustomerId}
        onClose={() => ctx.setPaymentOpen(false)}
        onSuccess={() => {
          window.dispatchEvent(new Event('refresh-data'));
        }}
      />

      <StockEntryModal
        isOpen={ctx.stockEntryOpen || false}
        defaultProductId={ctx.stockProductId}
        onClose={() => ctx.setStockEntryOpen(false)}
        onSuccess={() => {
          window.dispatchEvent(new Event('refresh-data'));
        }}
      />
    </>
  );
};

const ProtectedLayoutWrapper: React.FC = () => {
  return (
    <>
      <Layout />
      <GlobalModalContainer />
    </>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Protected Application Routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<ProtectedLayoutWrapper />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/products" element={<Products />} />
                <Route path="/stock" element={<StockMovements />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/customers/:id" element={<CustomerDetail />} />
                <Route path="/ledger" element={<Ledger />} />
                <Route path="/collections" element={<Collections />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/profit-targets" element={<ProfitTargets />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/audit-logs" element={<AuditLogs />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
};

export default App;
