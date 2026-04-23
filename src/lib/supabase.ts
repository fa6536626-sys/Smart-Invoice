import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const getSupabaseConfig = () => {
  return {
    url: localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL || '',
    key: localStorage.getItem('supabase_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  };
};

export const createSupabaseClient = (url: string, key: string): SupabaseClient | null => {
  if (!url || !key) return null;
  try {
    return createClient(url, key);
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

export const resetSupabaseConfig = () => {
  localStorage.removeItem('supabase_url');
  localStorage.removeItem('supabase_key');
  supabase = createSupabaseClient('', '');
};
