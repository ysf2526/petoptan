import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { Layout } from '@/components/layout/Layout';

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
import { Assistant } from '@/pages/Assistant';
import { PreOrders } from '@/pages/PreOrders';
import { SupplyPlan } from '@/pages/SupplyPlan';
import { Catalog } from '@/pages/Catalog';
import { PublicCatalog } from '@/pages/PublicCatalog';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* Public Mobile Catalog Route (No Auth Required) */}
            <Route path="/catalog/:slug" element={<PublicCatalog />} />

            {/* Protected Application Routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/assistant" element={<Assistant />} />
                <Route path="/catalog" element={<Catalog />} />
                <Route path="/pre-orders" element={<PreOrders />} />
                <Route path="/supply-plan" element={<SupplyPlan />} />
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
