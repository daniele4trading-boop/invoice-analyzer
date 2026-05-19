export interface Supplier {
  id: number;
  name: string;
  vat_number?: string;
  address?: string;
  email?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
}

export interface ProductCategory {
  id: number;
  name: string;
  description?: string;
}

export interface Product {
  id: number;
  name: string;
  code?: string;
  unit?: string;
  category_id?: number;
  category?: ProductCategory;
  created_at: string;
}

export interface InvoiceItem {
  id: number;
  product_id: number;
  description?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  vat_rate?: number;
  product?: Product;
}

export interface Invoice {
  id: number;
  number: string;
  date: string;
  supplier_id: number;
  total_amount: number;
  vat_amount?: number;
  net_amount?: number;
  notes?: string;
  file_path?: string;
  created_at: string;
  updated_at: string;
  supplier?: Supplier;
  items: InvoiceItem[];
}

export interface DeliveryNoteItem {
  id: number;
  product_id: number;
  description?: string;
  quantity: number;
  unit?: string;
  product?: Product;
}

export interface DeliveryNote {
  id: number;
  number: string;
  date: string;
  supplier_id: number;
  notes?: string;
  file_path?: string;
  created_at: string;
  supplier?: Supplier;
  items: DeliveryNoteItem[];
}

export interface PriceQuote {
  id: number;
  supplier_id: number;
  product_id: number;
  quoted_price: number;
  valid_from: string;
  valid_to?: string;
  notes?: string;
  created_at: string;
  supplier?: Supplier;
  product?: Product;
}

export interface SupplierAnalysis {
  supplier_name: string;
  supplier_id: number;
  total_invoices: number;
  total_amount: number;
  avg_invoice_amount: number;
}

export interface ProductAnalysis {
  product_name: string;
  product_id: number;
  category_name?: string;
  total_quantity: number;
  total_amount: number;
  avg_unit_price: number;
  supplier_count: number;
}

export interface PriceComparison {
  product_name: string;
  product_id: number;
  supplier_name: string;
  supplier_id: number;
  invoice_date: string;
  invoiced_price: number;
  quoted_price?: number;
  difference?: number;
  difference_pct?: number;
}

export interface ConsumptionReport {
  product_name: string;
  product_id: number;
  category_name?: string;
  total_quantity: number;
  total_amount: number;
  avg_unit_price: number;
  unit?: string;
}

export interface DashboardSummary {
  total_suppliers: number;
  total_products: number;
  total_invoices: number;
  total_delivery_notes: number;
  total_invoiced_amount: number;
  recent_invoices: Invoice[];
  top_suppliers: SupplierAnalysis[];
  top_products: ProductAnalysis[];
}
