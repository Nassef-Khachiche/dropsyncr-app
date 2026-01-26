// Use environment variable for API URL, fallback to /api for production
const API_URL = import.meta.env.VITE_API_URL || '/api';

class ApiService {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = localStorage.getItem('token');
    
    // Check if token exists
    if (!token && endpoint !== '/auth/login') {
      throw new Error('No authentication token found. Please log in again.');
    }

    const headers = {
      ...this.getAuthHeaders(),
      ...options.headers,
    };

    // Debug: Log token presence for auth endpoints
    if (endpoint.includes('/auth/') || endpoint.includes('/installations') || endpoint.includes('/dashboard')) {
      console.log(`[API] Request to ${endpoint}, token present: ${!!token}, token length: ${token?.length || 0}`);
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      const errorMessage = error.error || 'Request failed';
      const errorDetails = error.details || '';
      
      // Debug: Log 401 errors with full details
      if (response.status === 401) {
        const hadToken = !!localStorage.getItem('token');
        console.error(`[API] 401 Unauthorized on ${endpoint}`);
        console.error(`[API] hadToken: ${hadToken}`);
        console.error(`[API] error: ${errorMessage}`);
        console.error(`[API] details: ${errorDetails}`);
        if (error.code) console.error(`[API] error code: ${error.code}`);
      }
      
      // If token is invalid or expired, clear it and redirect to login
      // But only if we actually had a token (to avoid clearing on initial load)
      if (response.status === 401) {
        const hadToken = !!localStorage.getItem('token');
        if (hadToken) {
          // Don't clear token immediately - might be a temporary issue
          // Only clear if it's explicitly an invalid/expired token error
          if (errorMessage.includes('Invalid token') || errorMessage.includes('Token expired') || errorMessage.includes('expired') || errorMessage.includes('No token provided')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            // Trigger a custom event to notify the app to redirect to login
            window.dispatchEvent(new CustomEvent('auth:logout'));
            throw new Error('Your session has expired. Please log in again.');
          } else {
            // Other 401 errors - might be a backend issue, include details
            const fullMessage = errorDetails 
              ? `${errorMessage}: ${errorDetails}`
              : errorMessage || 'Authentication failed. Please try again.';
            throw new Error(fullMessage);
          }
        } else {
          // No token was present, just throw a regular error
          throw new Error('Authentication required. Please log in.');
        }
      }
      
      // For other errors, prefer details if available (more specific), otherwise use main error message
      const fullMessage = errorDetails || errorMessage;
      throw new Error(fullMessage);
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    return this.request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async verify() {
    return this.request<{ user: any }>('/auth/verify');
  }

  async getInstallations() {
    return this.request<any[]>('/auth/installations');
  }

  // Orders
  async getOrders(params?: {
    installationId?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.installationId) queryParams.append('installationId', params.installationId);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    return this.request<{ orders: any[]; pagination: any }>(
      `/orders?${queryParams.toString()}`
    );
  }

  async getOrder(id: number) {
    return this.request<any>(`/orders/${id}`);
  }

  async createOrder(data: any) {
    return this.request<any>('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateOrder(id: number, data: any) {
    return this.request<any>(`/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteOrder(id: number) {
    return this.request<{ message: string }>(`/orders/${id}`, {
      method: 'DELETE',
    });
  }

  // Products
  async getProducts(params?: {
    installationId?: string;
    search?: string;
    archived?: string;
    bundled?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.installationId) queryParams.append('installationId', params.installationId);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.archived) queryParams.append('archived', params.archived);
    if (params?.bundled) queryParams.append('bundled', params.bundled);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    return this.request<{ products: any[]; pagination: any }>(
      `/products?${queryParams.toString()}`
    );
  }

  async getProduct(id: number) {
    return this.request<any>(`/products/${id}`);
  }

  async createProduct(data: any) {
    return this.request<any>('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProduct(id: number, data: any) {
    return this.request<any>(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProduct(id: number) {
    return this.request<{ message: string }>(`/products/${id}`, {
      method: 'DELETE',
    });
  }

  async bulkUpdateStock(productIds: number[], stockUpdates: any[]) {
    return this.request<any>('/products/bulk-update-stock', {
      method: 'POST',
      body: JSON.stringify({ productIds, stockUpdates }),
    });
  }

  // Dashboard
  async getDashboardStats(installationId?: string) {
    const queryParams = installationId ? `?installationId=${installationId}` : '';
    return this.request<any>(`/dashboard/stats${queryParams}`);
  }

  // Tracking
  async getTrackings(params?: { status?: string; search?: string }) {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);

    return this.request<any[]>(`/tracking?${queryParams.toString()}`);
  }

  async createTracking(data: any) {
    return this.request<any>('/tracking', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async bulkCreateTracking(trackings: any[]) {
    return this.request<any>('/tracking/bulk', {
      method: 'POST',
      body: JSON.stringify({ trackings }),
    });
  }

  // Carriers
  async getCarriers(installationId: string) {
    return this.request<any[]>(`/carriers?installationId=${installationId}`);
  }

  async createCarrier(data: any) {
    return this.request<any>('/carriers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCarrier(id: number, data: any) {
    return this.request<any>(`/carriers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCarrier(id: number) {
    return this.request<{ message: string }>(`/carriers/${id}`, {
      method: 'DELETE',
    });
  }

  async testCarrier(id: number) {
    return this.request<{ success: boolean; message: string }>(`/carriers/${id}/test`, {
      method: 'POST',
    });
  }

  async generateCarrierLabels(carrierId: number, data: any) {
    return this.request<{ success: boolean; labels: any[] }>(`/carriers/${carrierId}/labels`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Tickets
  async getTickets(params?: {
    status?: string;
    priority?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.priority) queryParams.append('priority', params.priority);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    return this.request<{ tickets: any[]; pagination: any }>(
      `/tickets?${queryParams.toString()}`
    );
  }

  async getTicket(id: number) {
    return this.request<any>(`/tickets/${id}`);
  }

  async createTicket(data: any) {
    return this.request<any>('/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async addTicketMessage(id: number, message: string, attachments?: string[]) {
    return this.request<any>(`/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message, attachments }),
    });
  }

  async updateTicket(id: number, data: any) {
    return this.request<any>(`/tickets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Admin
  async getUsers(params?: {
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    return this.request<{ users: any[]; pagination: any }>(
      `/admin/users?${queryParams.toString()}`
    );
  }

  async createUser(data: any) {
    return this.request<any>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id: number, data: any) {
    return this.request<any>(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id: number) {
    return this.request<{ message: string }>(`/admin/users/${id}`, {
      method: 'DELETE',
    });
  }

  // Installations
  async getInstallationsList(params?: {
    search?: string;
    type?: string;
    active?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.type) queryParams.append('type', params.type);
    if (params?.active) queryParams.append('active', params.active);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    return this.request<{ installations: any[]; pagination: any }>(
      `/installations?${queryParams.toString()}`
    );
  }

  async getInstallation(id: number) {
    return this.request<any>(`/installations/${id}`);
  }

  async createInstallation(data: any) {
    return this.request<any>('/installations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateInstallation(id: number, data: any) {
    return this.request<any>(`/installations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteInstallation(id: number) {
    return this.request<{ message: string }>(`/installations/${id}`, {
      method: 'DELETE',
    });
  }

  // Integrations
  async getIntegrations(installationId: string) {
    return this.request<{ integrations: any[] }>(
      `/integrations?installationId=${installationId}`
    );
  }

  async createIntegration(data: any) {
    return this.request<{ integration: any }>('/integrations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateIntegration(id: number, data: any) {
    return this.request<{ integration: any }>(`/integrations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteIntegration(id: number) {
    return this.request<{ success: boolean; message: string }>(`/integrations/${id}`, {
      method: 'DELETE',
    });
  }

  async testIntegration(id: number) {
    return this.request<{ success: boolean; message: string }>(`/integrations/${id}/test`, {
      method: 'POST',
    });
  }

  // Bol.com Integration
  async syncBolOrders(installationId: string) {
    return this.request<{ success: boolean; imported: number; updated: number; total: number }>(
      `/bol/sync-orders?installationId=${installationId}`
    );
  }

  async getBolShippingLabel(installationId: string, orderId: string) {
    return this.request<any>(
      `/bol/shipping-label?installationId=${installationId}&orderId=${orderId}`
    );
  }

  async updateBolShipment(installationId: string, data: any) {
    return this.request<{ success: boolean; data: any }>(
      `/bol/shipment?installationId=${installationId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  }

  async getBolReturns(installationId: string, page: number = 1) {
    return this.request<any>(
      `/bol/returns?installationId=${installationId}&page=${page}`
    );
  }

  async handleBolReturn(installationId: string, returnId: string, data: any) {
    return this.request<{ success: boolean; data: any }>(
      `/bol/return/${returnId}?installationId=${installationId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  }
}

export const api = new ApiService();

