// Use environment variable for API URL, fallback to /api for production
const API_URL = import.meta.env.VITE_API_URL || '/api';

const formatApiErrorPart = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    return value
      .map((entry) => formatApiErrorPart(entry))
      .filter(Boolean)
      .join(' | ');
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const prioritized = [record.detail, record.message, record.error, record.description, record.title, record.code]
      .map((entry) => formatApiErrorPart(entry))
      .filter(Boolean);

    if (prioritized.length > 0) {
      return prioritized.join(' | ');
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
};

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
    
    if (!token && endpoint !== '/auth/login') {
      throw new Error('No authentication token found. Please log in again.');
    }

    const headers = {
      ...this.getAuthHeaders(),
      ...options.headers,
    };

    if (endpoint.includes('/auth/') || endpoint.includes('/installations') || endpoint.includes('/dashboard')) {
      console.log(`[API] Request to ${endpoint}, token present: ${!!token}, token length: ${token?.length || 0}`);
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      const errorMessage = formatApiErrorPart(error.error) || 'Request failed';
      const errorDetails = formatApiErrorPart(error.details);
      const endpointWithStatus = `${endpoint} (HTTP ${response.status})`;
      
      if (response.status === 401) {
        const hadToken = !!localStorage.getItem('token');
        console.error(`[API] 401 Unauthorized on ${endpoint}`);
        console.error(`[API] hadToken: ${hadToken}`);
        console.error(`[API] error: ${errorMessage}`);
        console.error(`[API] details: ${errorDetails}`);
        if (error.code) console.error(`[API] error code: ${error.code}`);
      }
      
      if (response.status === 401) {
        const hadToken = !!localStorage.getItem('token');
        if (hadToken) {
          if (errorMessage.includes('Invalid token') || errorMessage.includes('Token expired') || errorMessage.includes('expired') || errorMessage.includes('No token provided')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.dispatchEvent(new CustomEvent('auth:logout'));
            throw new Error('Your session has expired. Please log in again.');
          } else {
            const fullMessage = errorDetails 
              ? `${errorMessage}: ${errorDetails}`
              : errorMessage || 'Authentication failed. Please try again.';
            throw new Error(fullMessage);
          }
        } else {
          throw new Error('Authentication required. Please log in.');
        }
      }
      
      const fullMessage = errorDetails
        ? `${errorMessage}: ${errorDetails}`
        : `${errorMessage} at ${endpointWithStatus}`;
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
    userScoped?: boolean;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    fulfillmentType?: string;
    expiringTomorrow?: boolean;
    storeName?: string;
    vvbWindow?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.installationId) queryParams.append('installationId', params.installationId);
    if (params?.userScoped) queryParams.append('userScoped', 'true');
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.fulfillmentType) queryParams.append('fulfillmentType', params.fulfillmentType);
    if (params?.expiringTomorrow) queryParams.append('expiringTomorrow', 'true');
    if (params?.storeName && params.storeName !== 'all') queryParams.append('storeName', params.storeName);
    if (params?.vvbWindow) queryParams.append('vvbWindow', params.vvbWindow);

    return this.request<{ orders: any[]; pagination: any; stats: any }>(
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

  // Products (existing order-related products)
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

  // Warehouse Products
  async getWarehouseProducts(params?: {
    installationId?: string;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.installationId) queryParams.append('installationId', params.installationId);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    return this.request<{ products: any[]; pagination: any; stats: any }>(
      `/warehouse-products?${queryParams.toString()}`
    );
  }

  async createWarehouseProduct(data: any) {
    return this.request<any>('/warehouse-products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateWarehouseProduct(id: number, data: any) {
    return this.request<any>(`/warehouse-products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteWarehouseProduct(id: number) {
    return this.request<{ message: string }>(`/warehouse-products/${id}`, {
      method: 'DELETE',
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

  async refreshWeGrowTracking(carrierId: number, shipmentId: string) {
    return this.request<{
      success: boolean;
      shipmentId: string;
      carrierTrackingId: string | null;
      eta: string | null;
      events: any[];
      latestStatus: {
        time: string | null;
        milestone: string | null;
        code: string | null;
        subCode: string | null;
        description: string | null;
      } | null;
    }>('/tracking/wegrow/refresh', {
      method: 'POST',
      body: JSON.stringify({ carrierId, shipmentId }),
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

  // Automation Rules
  async getAutomationRules(params?: { installationId?: string; userScoped?: boolean }) {
    const queryParams = new URLSearchParams();
    if (params?.installationId) queryParams.append('installationId', params.installationId);
    if (params?.userScoped) queryParams.append('userScoped', 'true');
    const queryString = queryParams.toString();

    return this.request<{ rules: any[] }>(
      `/automation-rules${queryString ? `?${queryString}` : ''}`
    );
  }

  async createAutomationRule(data: {
    installationId: number;
    name: string;
    countryCode: string;
    carrierType: string;
    priority: number;
    active?: boolean;
  }) {
    return this.request<{ rule: any }>('/automation-rules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAutomationRule(
    id: number,
    data: Partial<{
      name: string;
      countryCode: string;
      carrierType: string;
      priority: number;
      active: boolean;
    }>
  ) {
    return this.request<{ rule: any }>(`/automation-rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteAutomationRule(id: number) {
    return this.request<{ success: boolean; message: string }>(`/automation-rules/${id}`, {
      method: 'DELETE',
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
  async getIntegrations(installationId?: string, userScoped: boolean = false) {
    const queryParams = new URLSearchParams();
    if (installationId) queryParams.append('installationId', installationId);
    if (userScoped) queryParams.append('userScoped', 'true');

    const queryString = queryParams.toString();
    return this.request<{ integrations: any[] }>(
      `/integrations${queryString ? `?${queryString}` : ''}`
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

  async getIntegrationCredentials(id: number) {
    return this.request<{
      integrationId: number;
      platform: string;
      credentials: {
        shopName: string | null;
        shopDomain?: string;
        accessToken?: string;
        clientId: string;
        clientSecret: string;
      };
    }>(`/integrations/${id}/credentials`);
  }

  // Kaufland Integration
  async syncKauflandOrders(installationId: string, integrationId?: number) {
    const queryParams = new URLSearchParams();
    queryParams.append('installationId', installationId);
    if (integrationId) queryParams.append('integrationId', String(integrationId));

    return this.request<{ success: boolean; imported: number; updated: number; total: number }>(
      `/kaufland/sync-orders?${queryParams.toString()}`
    );
  }

  // BricoBravo Integration
  async syncBricoBravoOrders(installationId: string, integrationId?: number) {
    const queryParams = new URLSearchParams();
    queryParams.append('installationId', installationId);
    if (integrationId) queryParams.append('integrationId', String(integrationId));

    return this.request<{ success: boolean; imported: number; updated: number; total: number }>(
      `/bricobravo/sync-orders?${queryParams.toString()}`
    );
  }

  // Shopify Integration
  async syncShopifyOrders(installationId: string, integrationId?: number) {
    const queryParams = new URLSearchParams();
    queryParams.append('installationId', installationId);
    if (integrationId) queryParams.append('integrationId', String(integrationId));

    return this.request<{ success: boolean; imported: number; updated: number; total: number }>(
      `/shopify/sync-orders?${queryParams.toString()}`
    );
  }

  async fulfillShopifyOrder(
    installationId: string,
    shopifyOrderId: string,
    trackingNumber?: string,
    trackingCompany?: string,
    integrationId?: number,
  ) {
    return this.request<{ success: boolean; fulfillment: any }>('/shopify/fulfill-order', {
      method: 'POST',
      body: JSON.stringify({ installationId, shopifyOrderId, trackingNumber, trackingCompany, integrationId }),
    });
  }

  async getShopifyShopInfo(installationId: string, integrationId?: number) {
    const queryParams = new URLSearchParams();
    queryParams.append('installationId', installationId);
    if (integrationId) queryParams.append('integrationId', String(integrationId));

    return this.request<{ name: string; domain: string; currency: string; country: string; email: string; planName: string }>(
      `/shopify/shop-info?${queryParams.toString()}`
    );
  }

  async startShopifyOAuth(installationId: string, integrationId: number) {
    return this.request<{ success: boolean; authUrl: string }>('/shopify/oauth/start', {
      method: 'POST',
      body: JSON.stringify({ installationId, integrationId }),
    });
  }

  // Bol.com Integration
  async syncBolOrders(installationId: string, integrationId?: number) {
    const queryParams = new URLSearchParams();
    queryParams.append('installationId', installationId);
    if (integrationId) queryParams.append('integrationId', String(integrationId));

    return this.request<{ success: boolean; imported: number; updated: number; total: number }>(
      `/bol/sync-orders?${queryParams.toString()}`
    );
  }

  async getBolShippingLabel(
    installationId: string,
    orderId: string,
    integrationId?: number | string,
    shippingLabelOfferId?: string,
    orderItems?: Array<{ orderItemId: string; quantity: number }>,
  ) {
    return this.request<any>('/bol/shipping-label', {
      method: 'POST',
      body: JSON.stringify({
        installationId,
        orderId,
        ...(integrationId !== undefined && integrationId !== null && String(integrationId).trim() ? { integrationId } : {}),
        ...(shippingLabelOfferId !== undefined && shippingLabelOfferId !== null && String(shippingLabelOfferId).trim() ? { shippingLabelOfferId } : {}),
        ...(Array.isArray(orderItems) && orderItems.length > 0 ? { orderItems } : {}),
      }),
    });
  }

  async getBolDeliveryOptions(installationId: string, orderId: string, integrationId?: number | string) {
    const queryParams = new URLSearchParams();
    queryParams.append('installationId', installationId);
    queryParams.append('orderId', orderId);
    if (integrationId !== undefined && integrationId !== null && String(integrationId).trim()) {
      queryParams.append('integrationId', String(integrationId));
    }

    return this.request<{
      success: boolean;
      orderItems: Array<{ orderItemId: string; quantity: number }>;
      deliveryOptions: Array<any>;
      selectedDeliveryOption: any | null;
    }>(`/bol/delivery-options?${queryParams.toString()}`);
  }

  async getBolLabelPdf(
    shippingLabelId: string,
    installationId: string,
    integrationId?: string,
    orderId?: string,
  ) {
    const queryParams = new URLSearchParams();
    queryParams.append('shippingLabelId', shippingLabelId);
    queryParams.append('installationId', installationId);
    if (integrationId) queryParams.append('integrationId', integrationId);
    if (orderId) queryParams.append('orderId', orderId);
    return this.request<{
      ready: boolean;
      shippingLabelId?: string;
      labelUrl?: string;
      trackingCode?: string | null;
      transporterCode?: string | null;
    }>(`/bol/label-pdf?${queryParams.toString()}`);
  }

  async getBolLabelByOrder(orderId: string, installationId: string, integrationId?: string) {
    const queryParams = new URLSearchParams();
    queryParams.append('orderId', orderId);
    queryParams.append('installationId', installationId);
    if (integrationId) queryParams.append('integrationId', integrationId);
    return this.request<{
      ready: boolean;
      labelUrl?: string;
      shippingLabelId?: string;
    }>(`/bol/label-by-order?${queryParams.toString()}`);
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

  // Returns
  async getReturns(params?: {
    installationId?: string;
    status?: string;
    search?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.installationId) queryParams.append('installationId', params.installationId);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);

    return this.request<{ returns: any[] }>(`/returns?${queryParams.toString()}`);
  }

  async getReturn(id: number) {
    return this.request<any>(`/returns/${id}`);
  }

  async createReturn(data: any) {
    return this.request<any>('/returns', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateReturn(id: number, data: any) {
    return this.request<any>(`/returns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteReturn(id: number) {
    return this.request<{ message: string }>(`/returns/${id}`, {
      method: 'DELETE',
    });
  }

  // Warehouse Address
  async getWarehouseAddress(installationId: string) {
    return this.request<any>(`/warehouse?installationId=${installationId}`);
  }

  async upsertWarehouseAddress(data: any) {
    return this.request<any>('/warehouse', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Warehouse Locations
  async getLocations(installationId: string) {
    return this.request<{ locations: any[] }>(`/locations?installationId=${installationId}`);
  }

  async createLocation(data: any) {
    return this.request<any>('/locations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async bulkCreateLocations(data: any) {
    return this.request<{ locations: any[]; count: number }>('/locations/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateLocation(id: number, data: any) {
    return this.request<any>(`/locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteLocation(id: number) {
    return this.request<{ message: string }>(`/locations/${id}`, {
      method: 'DELETE',
    });
  }

  // ─── Stock / Inventory ───────────────────────────────────────────────────────

  async getInventory(params?: {
    installationId?: string;
    search?: string;
    status?: string;
    sort?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.installationId) queryParams.append('installationId', params.installationId);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.sort) queryParams.append('sort', params.sort);
    return this.request<{ items: any[]; stats: any }>(`/stock?${queryParams.toString()}`);
  }

  async inboundStock(data: {
    installationId: number;
    productId: number;
    locationId: number;
    quantity: number;
    reference?: string;
    notes?: string;
  }) {
    return this.request<any>('/stock/inbound', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async reserveStock(data: {
    installationId: number;
    productId: number;
    orderId: number;
    quantity: number;
  }) {
    return this.request<any>('/stock/reserve', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async cancelReservation(id: number) {
    return this.request<any>(`/stock/reserve/${id}/cancel`, {
      method: 'DELETE',
    });
  }

  async pickStock(data: {
    reservationId: number;
    notes?: string;
  }) {
    return this.request<any>('/stock/pick', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async adjustStock(data: {
    installationId: number;
    productId: number;
    locationId?: number;
    quantity: number;
    notes: string;
  }) {
    return this.request<any>('/stock/adjust', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getProductMutations(productId: number, installationId: string) {
    return this.request<{ mutations: any[] }>(
      `/stock/${productId}/mutations?installationId=${installationId}`
    );
  }

  async getProductBatches(productId: number, installationId: string) {
    return this.request<{ batches: any[] }>(
      `/stock/${productId}/batches?installationId=${installationId}`
    );
  }

  async moveBatchLocation(batchId: number, data: { newLocationId: number; notes?: string }) {
    return this.request<{ message: string; batchId: number; newLocationId: number }>(
      `/stock/batch/${batchId}/location`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  }

  async getAllMutations(params?: { installationId?: string; period?: string }) {
    const queryParams = new URLSearchParams();
    if (params?.installationId) queryParams.append('installationId', params.installationId);
    if (params?.period) queryParams.append('period', params.period);
    return this.request<{ mutations: any[] }>(`/stock/mutations?${queryParams.toString()}`);
  }

  // ─── EAN Aliassen ────────────────────────────────────────────────────────────

  async getEanAliases(productId: number, installationId: string) {
    return this.request<{ aliases: any[] }>(
      `/stock/${productId}/ean-aliases?installationId=${installationId}`
    );
  }

  async addEanAlias(productId: number, data: { ean: string; installationId: number }) {
    return this.request<{ alias: any }>(`/stock/${productId}/ean-aliases`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteEanAlias(productId: number, aliasId: number) {
    return this.request<{ message: string }>(`/stock/${productId}/ean-aliases/${aliasId}`, {
      method: 'DELETE',
    });
  }

  // ─── Pick ────────────────────────────────────────────────────────────────────

  async getPicklist(orderIds: number[]) {
    return this.request<{ orders: any[] }>(
      `/orders/picklist?orderIds=${orderIds.join(',')}`
    );
  }

  async pickOrders(orderIds: number[], installationId: string) {
    return this.request<{ success: boolean; processed: number; errors: number; results: any[] }>(
      '/orders/pick', {
        method: 'POST',
        body: JSON.stringify({ orderIds, installationId }),
      }
    );
  }
}

export const api = new ApiService();