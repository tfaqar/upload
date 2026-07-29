import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Settings, Upload, Image as ImageIcon, Check, X, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';

// Types
interface Client {
  rowIndex: number;
  name: string;
}

interface AppsScriptResponse {
  status: string;
  message?: string;
}

export default function Home() {
  const [appsScriptUrl, setAppsScriptUrl] = useState<string>('');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState<boolean>(false);
  const [clientsError, setClientsError] = useState<string | null>(null);

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Combobox state
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load settings on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem('appsScriptUrl');
    if (savedUrl) {
      setAppsScriptUrl(savedUrl);
      fetchClients(savedUrl);
    } else {
      setShowSettings(true);
    }
  }, []);

  // Fetch clients from GAS
  const fetchClients = async (url: string) => {
    if (!url) return;
    
    setIsLoadingClients(true);
    setClientsError(null);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('فشل في تحميل البيانات');
      const data = await response.json();
      
      // Expected shape: [{ rowIndex: number, name: string }, ...]
      if (Array.isArray(data)) {
        setClients(data);
      } else {
        throw new Error('تنسيق البيانات غير صحيح');
      }
    } catch (err: any) {
      setClientsError('حدث خطأ أثناء تحميل العملاء. تأكد من صحة الرابط وأن الصلاحيات مفتوحة.');
      console.error('Fetch clients error:', err);
    } finally {
      setIsLoadingClients(false);
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem('appsScriptUrl', appsScriptUrl);
    setShowSettings(false);
    fetchClients(appsScriptUrl);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setImages(prev => [...prev, ...newFiles]);
      
      // Generate previews
      newFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setImagePreviews(prev => [...prev, event.target!.result as string]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
    // Reset file input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const compressImage = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          if (width > 1200) {
            height = Math.round(height * (1200 / width));
            width = 1200;
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context not available'));
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleUpload = async () => {
    if (!selectedClient) {
      setUploadError('يرجى اختيار العميل أولاً');
      return;
    }
    if (images.length === 0) {
      setUploadError('يرجى اختيار صورة واحدة على الأقل');
      return;
    }
    if (!appsScriptUrl) {
      setUploadError('يرجى إعداد رابط Google Apps Script أولاً');
      setShowSettings(true);
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      // Compress images sequentially
      const compressedImages: string[] = [];
      for (const file of images) {
        const base64 = await compressImage(file);
        // Extract just the base64 part, or send as data URL depending on GAS script. 
        // We'll send the full data URL as requested by the prompt.
        compressedImages.push(base64);
      }

      const payload = {
        rowIndex: selectedClient.rowIndex,
        clientName: selectedClient.name,
        images: compressedImages
      };

      const response = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8' // Required for Apps Script CORS
        },
        body: JSON.stringify(payload)
      });

      const result: AppsScriptResponse = await response.json();
      
      if (result.status === 'success') {
        setUploadSuccess(true);
        setTimeout(() => {
          // Reset form
          setSelectedClient(null);
          setImages([]);
          setImagePreviews([]);
          setUploadSuccess(false);
        }, 3000);
      } else {
        throw new Error(result.message || 'فشل في الرفع');
      }

    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadError(`حدث خطأ أثناء الرفع: ${err.message || 'تأكد من الرابط'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Filter clients based on search query
  const filteredClients = useMemo(() => {
    if (!searchQuery) return [];
    const query = searchQuery.toLowerCase();
    const matches = clients.filter(c => c.name.toLowerCase().includes(query));
    
    // Limit to 50 if query is short to avoid rendering thousands of DOM nodes
    if (searchQuery.length < 2) {
      return matches.slice(0, 50);
    }
    return matches;
  }, [clients, searchQuery]);

  return (
    <div className="min-h-screen bg-background py-10 px-4 md:px-8 flex flex-col items-center">
      
      {/* Header */}
      <div className="w-full max-w-xl flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-foreground">رفع صور العملاء</h1>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="إعدادات"
          data-testid="button-settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <div className="w-full max-w-xl flex flex-col gap-6">
        
        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm animate-in fade-in slide-in-from-top-4">
            <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              إعدادات النظام
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  رابط Google Apps Script
                </label>
                <input 
                  type="text" 
                  value={appsScriptUrl}
                  onChange={(e) => setAppsScriptUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full bg-background border border-input rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-left"
                  dir="ltr"
                  data-testid="input-gas-url"
                />
              </div>
              <button 
                onClick={handleSaveSettings}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg px-4 py-2.5 transition-colors flex justify-center items-center gap-2"
                data-testid="button-save-settings"
              >
                حفظ
              </button>
            </div>
          </div>
        )}

        {/* Main Form */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          
          <div className="p-6 space-y-6">
            
            {/* Client Selection */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                العميل
              </label>
              
              <Popover.Root open={comboboxOpen} onOpenChange={setComboboxOpen}>
                <Popover.Trigger asChild>
                  <button 
                    className={`w-full flex items-center justify-between bg-background border rounded-lg px-4 py-3 text-sm transition-colors
                      ${selectedClient ? 'text-foreground border-input' : 'text-muted-foreground border-input/60 hover:border-input'}
                      focus:outline-none focus:ring-2 focus:ring-primary/50
                    `}
                    disabled={isLoadingClients}
                    data-testid="button-select-client"
                  >
                    <span className="truncate">
                      {isLoadingClients 
                        ? 'تحميل العملاء...' 
                        : selectedClient 
                          ? selectedClient.name 
                          : 'اختر اسم العميل'}
                    </span>
                    {isLoadingClients ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0 ml-1" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 ml-1 opacity-50" />
                    )}
                  </button>
                </Popover.Trigger>
                
                <Popover.Portal>
                  <Popover.Content 
                    className="z-50 w-[var(--radix-popover-trigger-width)] bg-popover border border-border rounded-lg shadow-md overflow-hidden"
                    align="start"
                    sideOffset={4}
                    dir="rtl"
                  >
                    <Command className="w-full bg-popover" shouldFilter={false}>
                      <div className="flex items-center border-b border-border px-3" cmdk-input-wrapper="">
                        <Command.Input 
                          placeholder="ابحث عن عميل..." 
                          value={searchQuery}
                          onValueChange={setSearchQuery}
                          className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </div>
                      
                      <Command.List className="max-h-60 overflow-y-auto p-1">
                        {!searchQuery ? (
                          <div className="py-6 text-center text-sm text-muted-foreground">
                            ابدأ الكتابة للبحث...
                          </div>
                        ) : filteredClients.length === 0 ? (
                          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                            لا يوجد عملاء مطابقين للبحث.
                          </Command.Empty>
                        ) : (
                          <Command.Group>
                            {filteredClients.map((client) => (
                              <Command.Item
                                key={client.rowIndex}
                                value={client.name}
                                onSelect={() => {
                                  setSelectedClient(client);
                                  setComboboxOpen(false);
                                  setSearchQuery('');
                                }}
                                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                              >
                                {client.name}
                                {selectedClient?.rowIndex === client.rowIndex && (
                                  <Check className="mr-auto w-4 h-4 text-primary" />
                                )}
                              </Command.Item>
                            ))}
                          </Command.Group>
                        )}
                      </Command.List>
                    </Command>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
              
              {clientsError && (
                <p className="mt-2 text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {clientsError}
                </p>
              )}
            </div>

            {/* Image Selection */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                الصور
              </label>
              
              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
                  ${images.length > 0 ? 'border-primary/30 bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}
                `}
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone-area"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">اختر صوراً</p>
                    <p className="text-xs text-muted-foreground mt-1">اضغط لاختيار الصور من جهازك</p>
                  </div>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple 
                  accept="image/jpeg, image/png, image/webp"
                  className="hidden"
                  data-testid="input-file"
                />
              </div>

              {/* Image Previews */}
              {imagePreviews.length > 0 && (
                <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {imagePreviews.map((preview, idx) => (
                    <div key={idx} className="relative group rounded-lg overflow-hidden border border-border aspect-square bg-muted">
                      <img 
                        src={preview} 
                        alt={`Preview ${idx + 1}`} 
                        className="w-full h-full object-cover"
                      />
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(idx);
                        }}
                        className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`button-remove-image-${idx}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Errors & Success messages */}
            {uploadError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg flex items-start gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{uploadError}</p>
              </div>
            )}
            
            {uploadSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-sm rounded-lg flex items-start gap-2 animate-in fade-in">
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
                <p>تم الرفع بنجاح!</p>
              </div>
            )}

          </div>

          {/* Footer Actions */}
          <div className="p-4 bg-muted/30 border-t border-border flex justify-end">
            <button
              onClick={handleUpload}
              disabled={isUploading || isLoadingClients}
              className={`
                w-full sm:w-auto px-6 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-all
                ${isUploading || isLoadingClients 
                  ? 'bg-primary/50 text-white cursor-not-allowed' 
                  : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow active:scale-[0.98]'
                }
              `}
              data-testid="button-upload"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جاري الرفع...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 ml-1" />
                  رفع الصور
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
