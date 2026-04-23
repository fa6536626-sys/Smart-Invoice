import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const getSupabaseConfig = () => {
  return {
    url: localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL || 'https://nyggjxkczfktfydkiwux.supabase.co',
    key: localStorage.getItem('supabase_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_D1hAUOEpM40zxYX-XN6gjQ_Ebkh9iYU'
  };
};

export const createSupabaseClient = (url: string, key: string): SupabaseClient | null => {
  if (!url || !key) return null;
  try {
    // Sanitize URL: remove trailing /rest/v1/ and trailing slashes
    const cleanUrl = url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    return createClient(cleanUrl, key.trim());
  } catch (e) {
    console.error('Failed to create Supabase client', e);
    return null;
  }
};

export let supabase = createSupabaseClient(getSupabaseConfig().url, getSupabaseConfig().key);

export const saveSupabaseConfig = (url: string, key: string) => {
  localStorage.setItem('supabase_url', url);
  localStorage.setItem('supabase_key', key);
  supabase = createSupabaseClient(url, key);
};

export const testConnection = async (url: string, key: string) => {
  const tempClient = createSupabaseClient(url, key);
  if (!tempClient) return { success: false, message: 'فشل في إنشاء العميل' };
  
  try {
    const { error } = await tempClient.from('extracted_invoices').select('id').limit(1);
    if (error) {
      if (error.code === 'PGRST116') return { success: true, message: 'متصل (الجدول فارغ)' };
      return { success: false, message: error.message };
    }
    return { success: true, message: 'متصل بنجاح' };
  } catch (e: any) {
    return { success: false, message: e.message || 'خطأ غير معروف' };
  }
};

export const resetSupabaseConfig = () => {
  localStorage.removeItem('supabase_url');
  localStorage.removeItem('supabase_key');
  supabase = createSupabaseClient('', '');
};
