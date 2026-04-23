import React, { useState, useEffect, useCallback } from 'react';
import { FileUpload } from './components/FileUpload';
import { ResultsTable } from './components/ResultsTable';
import { extractDataFromFile, ExtractedData } from './services/gemini';
import { FileText, History, Cloud, CloudOff, LogOut, LogIn, User as UserIcon, Settings, Database, X } from 'lucide-react';
import { supabase as initialSupabase, getSupabaseConfig, saveSupabaseConfig, resetSupabaseConfig, testConnection } from './lib/supabase';
import { User, SupabaseClient } from '@supabase/supabase-js';

export default function App() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(initialSupabase);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState(getSupabaseConfig());
  const [testStatus, setTestStatus] = useState<{ success?: boolean; message: string } | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState<ExtractedData[]>([]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const handleTestConnection = async () => {
    setTestStatus({ message: 'جاري الاختبار...' });
    const result = await testConnection(config.url, config.key);
    setTestStatus(result);
  };

  const updateConfig = (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseConfig(config.url, config.key);
    setSupabase(initialSupabase);
    setShowConfig(false);
    window.location.reload(); 
  };

  const handleResetConfig = () => {
    resetSupabaseConfig();
    setSupabase(null);
    setConfig({ url: '', key: '' });
    window.location.reload();
  };

  // Handle Auth
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        setData([]); // Clear data on logout
        // localStorage.removeItem('extracted_data'); // This might be dangerous if we want local persistent data, but okay for now
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Load data from Supabase on user change
  useEffect(() => {
    const loadSupabaseData = async () => {
      if (!supabase || !user) {
        if (!user) setIsLoaded(true);
        return;
      }
      
      setIsProcessing(true);
      try {
        const { data: supabaseData, error } = await supabase
          .from('extracted_invoices')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        const mappedData: ExtractedData[] = (supabaseData || []).map(item => ({
          id: item.id,
          type: item.type || (item.tax_number ? 'invoice' : 'receipt'),
          entityName: item.entity_name,
          taxNumber: item.tax_number,
          date: item.date,
          amount: Number(item.amount),
          taxAmount: Number(item.tax_amount),
          taxEnabled: item.tax_enabled,
          location: item.location,
          referenceNumber: item.reference_number,
          paymentField: item.payment_field,
          fileName: 'سجل سحابي'
        }));
        setData(mappedData);
      } catch (err) {
        console.error('Error loading from Supabase:', err);
      } finally {
        setIsLoaded(true);
        setIsProcessing(false);
      }
    };

    loadSupabaseData();
  }, [user]);

  // Sync to local storage and Supabase
  useEffect(() => {
    if (!isLoaded) return;

    if (!user) return;

    try {
      localStorage.setItem(`extracted_data_${user.id}`, JSON.stringify(data));
    } catch (e) {
      console.warn("LocalStorage full, only cloud sync active");
    }
    
    const syncToSupabase = async () => {
      if (!supabase || !user) return;
      
      setIsSyncing(true);
      try {
        const newItems = data.filter(item => !item.id);
        
        if (newItems.length > 0) {
          const { data: insertedData, error: insertError } = await supabase
            .from('extracted_invoices')
            .insert(newItems.map(item => ({
              type: item.type,
              entity_name: item.entityName,
              tax_number: item.taxNumber,
              date: item.date,
              amount: item.amount,
              tax_amount: item.taxAmount,
              tax_enabled: item.taxEnabled,
              location: item.location,
              reference_number: item.referenceNumber,
              payment_field: item.paymentField,
              user_id: user.id
            })))
            .select();

          if (insertError) throw insertError;

          // Update local state with the IDs from Supabase to prevent re-syncing
          if (insertedData) {
            setData(prev => prev.map(localItem => {
              const matched = insertedData.find(dbItem => 
                dbItem.entity_name === localItem.entityName && 
                dbItem.amount === localItem.amount && 
                dbItem.date === localItem.date &&
                !localItem.id
              );
              return matched ? { ...localItem, id: matched.id } : localItem;
            }));
          }
        }
      } catch (err) {
        console.error('Error syncing to Supabase:', err);
      } finally {
        setIsSyncing(false);
      }
    };

    const timeoutId = setTimeout(syncToSupabase, 2000); // Debounce sync
    return () => clearTimeout(timeoutId);
  }, [data, isLoaded]);

  const handleFilesSelected = async (files: File[]) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const BATCH_SIZE = 3; // Process 3 files at a time to stay within rate limits
      const resultsArray: ExtractedData[][] = [];
      
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(async (file) => {
          try {
            const results = await extractDataFromFile(file);
            
            // Initialize taxEnabled and calculate tax if needed
            return results.map(res => {
              const utilityKeywords = [
                "كهرباء", "الكهرباء", "السعودية للطاقة", "saudi electricity", "الشركة السعودية للكهرباء",
                "ماء", "مياه", "المياه الوطنية", "nwc", "الشركة الوطنية للمياه", "national water company",
                "اتصالات", "هاتف", "جوال", "stc", "اس تي سي", "الاتصالات السعودية", "mobily", "موبايلي", "zain", "زين",
                "booking", "بوكينج", "البوكينج", "booking.com b.v."
              ];
              const fieldToSearch = (res.paymentField || res.entityName || "").toLowerCase();
              const isUtility = utilityKeywords.some(kw => fieldToSearch.includes(kw));
              
              let taxEnabled = res.taxAmount ? res.taxAmount > 0 : false;
              let taxAmount = res.taxAmount;

              if (isUtility) {
                taxEnabled = true;
                if (!taxAmount || taxAmount === 0) {
                  taxAmount = Number((res.amount * 0.15 / 1.15).toFixed(2));
                }
              }

              return {
                ...res,
                taxEnabled,
                taxAmount
              };
            });
          } catch (err) {
            console.error(`Error processing file ${file.name}:`, err);
            return []; // Skip failed files instead of crashing the whole process
          }
        }));
        resultsArray.push(...batchResults);
        
        // Small delay between batches to be safe with rate limits
        if (i + BATCH_SIZE < files.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const allResults: ExtractedData[] = [];
      let duplicateCount = 0;

      for (const processedResults of resultsArray) {
        // Filter duplicates
        for (const newItem of processedResults) {
          const normalize = (s?: string) => s?.trim().toLowerCase() || "";
          
          const newItemNum = normalize(newItem.taxNumber || newItem.referenceNumber);
          const newItemDate = normalize(newItem.date);
          const newItemAmount = newItem.amount;

          const isDuplicate = data.some(existingItem => {
            const existingNum = normalize(existingItem.taxNumber || existingItem.referenceNumber);
            const existingDate = normalize(existingItem.date);
            return existingNum === newItemNum && 
                   existingDate === newItemDate && 
                   existingItem.amount === newItemAmount;
          }) || allResults.some(addedItem => {
            const addedNum = normalize(addedItem.taxNumber || addedItem.referenceNumber);
            const addedDate = normalize(addedItem.date);
            return addedNum === newItemNum && 
                   addedDate === newItemDate && 
                   addedItem.amount === newItemAmount;
          });

          if (isDuplicate) {
            duplicateCount++;
          } else {
            allResults.push(newItem);
          }
        }
      }

      if (duplicateCount > 0) {
        setError(`تم تجاهل ${duplicateCount} مستندات مكررة (تطابق في الاسم والرقم والتاريخ والقيمة).`);
      }
      
      setData(prev => [...allResults, ...prev]);
    } catch (err) {
      console.error(err);
      setError("حدث خطأ أثناء معالجة الملفات. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsProcessing(false);
    }
  };

  const removeRow = async (index: number) => {
    const itemToRemove = data[index];
    setData(prev => prev.filter((_, i) => i !== index));
    
    if (supabase && user && itemToRemove.id) {
      try {
        await supabase.from('extracted_invoices').delete().eq('id', itemToRemove.id).eq('user_id', user.id);
      } catch (err) {
        console.error('Error deleting from Supabase:', err);
      }
    }
  };

  const toggleTax = async (index: number) => {
    const item = data[index];
    const isEnabled = item.taxEnabled !== false;
    const newEnabled = !isEnabled;
    
    // If enabling and taxAmount is missing/zero, calculate 15% VAT (inclusive)
    let newTaxAmount = item.taxAmount;
    if (newEnabled && (!newTaxAmount || newTaxAmount === 0)) {
      newTaxAmount = Number((item.amount * 0.15 / 1.15).toFixed(2));
    }
    
    const updatedItem = { ...item, taxEnabled: newEnabled, taxAmount: newTaxAmount };
    
    setData(prev => prev.map((it, i) => i === index ? updatedItem : it));

    if (supabase && user && item.id) {
      try {
        await supabase.from('extracted_invoices')
          .update({ 
            tax_enabled: newEnabled, 
            tax_amount: newTaxAmount 
          })
          .eq('id', item.id)
          .eq('user_id', user.id);
      } catch (err) {
        console.error('Error updating tax in Supabase:', err);
      }
    }
  };

  const clearAll = async () => {
    const password = window.prompt("يرجى إدخال الرقم السري لمسح جميع البيانات:");
    
    if (password === "00") {
      setData([]);
      if (supabase && user) {
        try {
          await supabase.from('extracted_invoices').delete().eq('user_id', user.id);
        } catch (err) {
          console.error('Error clearing Supabase:', err);
        }
      }
    } else if (password !== null) {
      alert("عذراً، الرقم السري غير صحيح.");
    }
  };

  const handleLogin = async () => {
    if (!supabase) return;
    const email = window.prompt("ادخل البريد الإلكتروني:");
    if (!email) return;
    const password = window.prompt("ادخل كلمة المرور (يجب أن تكون ٦ خانات على الأقل):");
    if (!password) return;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        const confirmSignUp = window.confirm("الحساب غير موجود، هل تريد إنشاء حساب جديد؟");
        if (confirmSignUp) {
          const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
          });
          if (signUpError) alert(signUpError.message);
          else alert("تم إرسال رابط التفعيل لبريدك الإلكتروني (أو يمكنك الدخول مباشرة إذا كان التأكيد معطلاً).");
        }
      } else {
        alert(error.message);
      }
    }
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg" dir="rtl">
      {/* Header */}
      <header className="h-[70px] bg-card border-b-2 border-border flex items-center justify-between px-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
            <FileText className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-main tracking-tight leading-none">نظام استخراج البيانات</h1>
            <span className="text-[10px] text-primary font-bold uppercase tracking-widest mt-1 block">Smart AI Processor</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowConfig(true)}
            className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${supabase ? 'text-green-600 border-green-100 bg-green-50' : 'text-amber-600 border-amber-100 bg-amber-50'}`}
            title="إعدادات قاعدة البيانات"
          >
            <Database className="w-5 h-5" />
            <span className="text-xs font-semibold hidden sm:inline">قاعدة البيانات</span>
          </button>

          {user ? (
            <div className="flex items-center gap-3 bg-slate-50 p-1.5 pr-4 rounded-full border border-border">
              <span className="text-xs font-medium text-text-muted">{user.email}</span>
              <button 
                onClick={handleLogout}
                className="w-8 h-8 rounded-full bg-white border border-border flex items-center justify-center text-text-muted hover:text-red-500 hover:border-red-200 transition-all shadow-sm"
                title="تسجيل الخروج"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="btn btn-primary px-6 flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>تسجيل الدخول</span>
            </button>
          )}
        </div>
      </header>

      {!user ? (
        <main className="flex-1 flex flex-col items-center justify-center p-10 bg-gradient-to-b from-bg to-slate-50">
          <div className="max-w-md w-full text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="relative inline-block">
              <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-2 transform rotate-12 transition-transform hover:rotate-0">
                <FileText className="w-12 h-12 text-primary" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                <Cloud className="w-4 h-4 text-primary" />
              </div>
            </div>
            
            <div className="space-y-3">
              <h2 className="text-3xl font-black text-text-main">مرحباً بك في النظام الذكي</h2>
              <p className="text-text-muted leading-relaxed">
                قم بتسجيل الدخول للوصول إلى مساحتك الخاصة ومزامنة بياناتك بأمان عبر السحابة.
              </p>
            </div>

            <button 
              onClick={handleLogin}
              className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-xl shadow-primary/30 hover:bg-primary-dark transition-all active:scale-[0.98] flex items-center justify-center gap-3"
            >
              <LogIn className="w-5 h-5" />
              ابدأ الآن ببياناتك المستقلة
            </button>

            <div className="flex items-center justify-center gap-4 text-xs text-text-muted pt-4">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                آمن تماماً
              </div>
              <div className="w-px h-3 bg-border"></div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                بيانات مستقلة لكل مستخدم
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main className="flex-1 grid grid-cols-[300px_1fr] gap-6 p-6 lg:px-10 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex flex-col gap-5 overflow-y-auto">
          <FileUpload onFilesSelected={handleFilesSelected} isProcessing={isProcessing} />
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg text-xs font-medium text-center">
              {error}
            </div>
          )}

          <ResultsTable 
            data={data} 
            onRemove={removeRow} 
            onToggleTax={toggleTax}
            onClear={clearAll}
            view="summary"
          />
        </aside>

        {/* Content Area */}
        <section className="card flex flex-col overflow-hidden">
          <ResultsTable 
            data={data} 
            onRemove={removeRow} 
            onToggleTax={toggleTax}
            onClear={clearAll}
            view="table"
          />
          
          {data.length === 0 && !isProcessing && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-4">
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center">
                <FileText className="w-8 h-8" />
              </div>
              <div className="max-w-xs">
                <h3 className="text-lg font-bold text-text-main">لا توجد بيانات مستخرجة</h3>
                <p className="text-sm text-text-muted leading-relaxed">
                  ارفع ملفات PDF أو صور الفواتير والإيصالات في المنطقة الجانبية للبدء.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
      )}

      {/* Footer */}
      <footer className="h-[60px] bg-card border-t border-border flex items-center justify-between px-10 shrink-0 text-xs text-text-muted">
        <div className="flex gap-5 items-center">
          <div className="flex items-center gap-2">
            {supabase ? (
              <>
                <Cloud className={`w-4 h-4 ${isSyncing ? 'text-blue-500 animate-pulse' : 'text-green-500'}`} />
                <span>{isSyncing ? 'جاري المزامنة مع السحابة...' : 'متصل بـ Supabase'}</span>
              </>
            ) : (
              <>
                <CloudOff className="w-4 h-4 text-amber-500" />
                <span>وضع الحفظ المحلي (Supabase غير مهيأ)</span>
              </>
            )}
          </div>
          <div className="h-4 w-px bg-border" />
          <span>آخر تحديث: {new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div>
          تم استخراج بيانات {data.length} مستندات من الملفات المرفوعة
        </div>
      </footer>

      {/* Configuration Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <header className="p-6 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3 text-primary">
                <Database className="w-6 h-6" />
                <h3 className="font-bold text-lg">إعدادات Supabase</h3>
              </div>
              <button 
                onClick={() => setShowConfig(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-text-muted" />
              </button>
            </header>
            
            <form onSubmit={updateConfig} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-text-muted">Supabase Project URL (API URL)</label>
                <div className="text-[10px] text-text-muted mb-1">تجدها في Vercel Dashboard أو Supabase Settings</div>
                <input 
                  type="url"
                  required
                  value={config.url}
                  onChange={(e) => setConfig({ ...config, url: e.target.value })}
                  placeholder="https://your-project.supabase.co"
                  className="w-full px-4 py-3 bg-bg border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm ltr"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-text-muted">Anon Payload / API Key</label>
                <div className="text-[10px] text-text-muted mb-1">يجب أن تبدأ بـ eyJ... (Anon Key)</div>
                <input 
                  type="password"
                  required
                  value={config.key}
                  onChange={(e) => setConfig({ ...config, key: e.target.value })}
                  placeholder="Anon Key / Public Key"
                  className="w-full px-4 py-3 bg-bg border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm ltr"
                  dir="ltr"
                />
              </div>

              {testStatus && (
                <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${testStatus.success ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                  <div className={`w-2 h-2 rounded-full ${testStatus.success ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  {testStatus.message}
                </div>
              )}

              <div className="pt-4 flex flex-col gap-3">
                <div className="flex gap-3">
                  <button 
                    type="submit"
                    className="flex-1 bg-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all"
                  >
                    حفظ وتحديث
                  </button>
                  <button 
                    type="button"
                    onClick={handleTestConnection}
                    className="px-6 py-3 bg-white border border-border text-text-main rounded-xl hover:bg-slate-50 transition-all font-bold text-sm"
                  >
                    اختبار الاتصال
                  </button>
                </div>
                <button 
                  type="button"
                  onClick={handleResetConfig}
                  className="w-full py-3 text-red-500 rounded-xl hover:bg-red-50 transition-all font-bold text-xs border border-transparent hover:border-red-100"
                >
                  إعادة ضبط الإعدادات الافتراضية
                </button>
              </div>
              
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <p className="text-[11px] text-text-muted leading-relaxed">
                  • يتم حفظ البيانات محلياً في متصفحك فقط.
                  <br />
                  • الربط مع Vercel يتطلب توفير المتغيرات المذكورة أعلاه.
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
