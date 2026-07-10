import axios from 'axios';

export const API_BASE = 'http://localhost:8000/api';
export const WS_BASE = 'ws://localhost:8000/api';

export const api = axios.create({
  baseURL: API_BASE,
});