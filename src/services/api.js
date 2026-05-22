import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── IMPORTANT ───────────────────────────────────────────────────────────────
// Replace this IP with your computer's local IP address (not localhost!)
// because the phone/emulator can't reach localhost on your PC.
// Find your IP: run "ipconfig" in Windows CMD → look for IPv4 Address
// Example: 'http://192.168.1.100:3000'
// ─────────────────────────────────────────────────────────────────────────────
const BASE_URL = 'https://order-manager-backend-5.onrender.com'; // Point to live Render backend

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to every request automatically
apiClient.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('userToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Auth API ────────────────────────────────────────────────────────────────
export const loginUser = async (userId, password) => {
  const response = await apiClient.post('/api/auth/login', { userId, password });
  return response.data;
};

// ─── Reports API ─────────────────────────────────────────────────────────────
export const fetchReport1 = async () => {
  const response = await apiClient.get('/api/reports/report1');
  return response.data;
};

export const fetchReport2 = async () => {
  const response = await apiClient.get('/api/reports/report2');
  return response.data;
};

export const fetchReport3 = async () => {
  const response = await apiClient.get('/api/reports/report3');
  return response.data;
};

export const fetchReport4 = async () => {
  const response = await apiClient.get('/api/reports/report4');
  return response.data;
};

// ─── Orders API ──────────────────────────────────────────────────────────────
export const createOrder = async (orderData) => {
  const response = await apiClient.post('/api/orders/create', orderData);
  return response.data;
};

// Update existing order - uses longer timeout for large orders (500+ items)
export const updateOrder = async (id, orderData) => {
  const response = await apiClient.put(`/api/orders/${id}`, orderData, { timeout: 120000 });
  return response.data;
};

// Fetch parties for dropdown — pass optional {orderNo, productId} to cascade
export const fetchParties = async (filters = {}) => {
  const response = await apiClient.get('/api/orders/parties', { params: filters });
  return response.data;
};

// Fetch products for dropdown — pass optional {partyId, orderNo} to cascade
export const fetchProducts = async (filters = {}) => {
  const response = await apiClient.get('/api/orders/products', { params: filters });
  return response.data;
};

// Fetch recent orders for dashboard
export const fetchOrders = async () => {
  const response = await apiClient.get('/api/orders/list');
  return response.data;
};

// Fetch salesmen for dropdown
export const fetchSalesmen = async () => {
  const response = await apiClient.get('/api/orders/salesmen');
  return response.data;
};

// Fetch specific order details
export const fetchOrderDetails = async (id) => {
  const response = await apiClient.get(`/api/orders/${id}`);
  return response.data;
};

// Fetch pending order report
export const fetchPendingOrderReport = async (filters) => {
  const response = await apiClient.get('/api/reports/pending-orders', { params: filters });
  return response.data;
};

// Fetch order numbers for report dropdown — pass optional {partyId, productId} to cascade
export const fetchOrderNumbers = async (filters = {}) => {
  const response = await apiClient.get('/api/orders/numbers', { params: filters });
  return response.data;
};

export const deleteOrder = async (id) => {
  const response = await apiClient.delete(`/api/orders/${id}`);
  return response.data;
};

// Fetch current FY stock for a single product (uses GetProductStockSummary SP)
export const fetchProductStock = async (productCode) => {
  const response = await apiClient.get('/api/orders/product-stock', { params: { productCode } });
  return response.data;
};

// Fetch dispatch report
export const fetchDispatchReport = async (filters) => {
  const response = await apiClient.get('/api/reports/dispatch', { params: filters });
  return response.data;
};

// Fetch dispatch numbers for cascading dropdown — pass optional {partyId, productId}
export const fetchDispatchNumbers = async (filters = {}) => {
  const response = await apiClient.get('/api/reports/dispatch-numbers', { params: filters });
  return response.data;
};

// Fetch products that appear in dispatches — pass optional {partyId, dispatchNo}
export const fetchDispatchProducts = async (filters = {}) => {
  const response = await apiClient.get('/api/reports/dispatch-products', { params: filters });
  return response.data;
};

// Fetch stock report
export const fetchStockReport = async (filters) => {
  const response = await apiClient.get('/api/reports/stock', { params: filters });
  return response.data;
};

// Fetch supplier order report
export const fetchSupplierOrderReport = async (filters) => {
  const response = await apiClient.get('/api/reports/supplier-orders', { params: filters });
  return response.data;
};

export default apiClient;
