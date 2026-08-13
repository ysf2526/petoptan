/**
  Turkish Currency and Date formatting utilities for PETSHOP TOPTAN
 */

export const formatCurrency = (val: number | null | undefined): string => {
  const amount = Number(val || 0);
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount) + ' TL';
};

export const formatNumber = (val: number | null | undefined, decimals = 0): string => {
  const amount = Number(val || 0);
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
};

export const formatDate = (dateStr: string | Date | null | undefined): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  }).format(d);
};

export const formatDateTime = (dateStr: string | Date | null | undefined): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  }).format(d);
};

export const calculateUnitProfit = (purchasePrice: number, salePrice: number): number => {
  return Number((salePrice - purchasePrice).toFixed(2));
};

export const calculateProfitMargin = (purchasePrice: number, salePrice: number): number => {
  if (purchasePrice <= 0) return 0;
  return Number((((salePrice - purchasePrice) / purchasePrice) * 100).toFixed(2));
};

export const getDaysInCurrentMonth = (): number => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
};

export const getRemainingDaysInCurrentMonth = (): number => {
  const now = new Date();
  const daysInMonth = getDaysInCurrentMonth();
  return daysInMonth - now.getDate() + 1;
};

export const getISOYearMonth = (date = new Date()): { year: number; month: number } => {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
};

export const getTodayRangeTR = (): { startStr: string; endStr: string; dateStr: string } => {
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now);
  return {
    startStr: `${todayStr}T00:00:00.000Z`,
    endStr: `${todayStr}T23:59:59.999Z`,
    dateStr: todayStr,
  };
};

export const getThisWeekRangeTR = (): { startStr: string; endStr: string; startDateStr: string; endDateStr: string } => {
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now);
  const parts = todayStr.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const startDateStr = monday.toISOString().split('T')[0];
  const endDateStr = sunday.toISOString().split('T')[0];

  return {
    startStr: `${startDateStr}T00:00:00.000Z`,
    endStr: `${endDateStr}T23:59:59.999Z`,
    startDateStr,
    endDateStr,
  };
};

export const getThisMonthRangeTR = (): { startStr: string; endStr: string; startDateStr: string; endDateStr: string } => {
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now);
  const parts = todayStr.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];

  const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return {
    startStr: `${startDateStr}T00:00:00.000Z`,
    endStr: `${endDateStr}T23:59:59.999Z`,
    startDateStr,
    endDateStr,
  };
};
