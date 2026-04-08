import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── IMPORTANT ───────────────────────────────────────────────────────────────
// Replace this IP with your computer's local IP address (not localhost!)
// because the phone/emulator can't reach localhost on your PC.
// Find your IP: run "ipconfig" in Windows CMD → look for IPv4 Address
// Example: 'http://192.168.1.100:3000'
// ─────────────────────────────────────────────────────────────────────────────
const BASE_URL = 'http://192.168.1.111:3000'; // Updated to match current Local IP

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

// Update existing order
export const updateOrder = async (id, orderData) => {
  const response = await apiClient.put(`/api/orders/${id}`, orderData);
  return response.data;
};

// Fetch parties for dropdown
export const fetchParties = async () => {
  const response = await apiClient.get('/api/orders/parties');
  return response.data;
};

// Fetch products for dropdown
export const fetchProducts = async () => {
  const response = await apiClient.get('/api/orders/products');
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

// Fetch order numbers for dropdown
export const fetchOrderNumbers = async () => {
  const response = await apiClient.get('/api/orders/numbers');
  return response.data;
};

// Delete order
export const deleteOrder = async (id) => {
  const response = await apiClient.delete(`/api/orders/${id}`);
  return response.data;
};

export default apiClient;
