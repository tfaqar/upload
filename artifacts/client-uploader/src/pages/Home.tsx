import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, Image as ImageIcon, Check, X, AlertCircle, Loader2, ChevronDown, Search } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';

// ─── Hardcoded Apps Script URL ───────────────────────────────────────────────
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbz8A_BpZd7VCSC24FugCeHRbqNjTHlNZ1DWpPGliwg3JevVC1ap-PcWHld02wkqbTRm/exec';

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

  // Fetch clients on mount
  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    setIsLoadingClients(true);
    setClientsError(null);
    try {
      const response = await fetch(APPS_SCRIPT_URL);
      if (!response.ok) throw new Error('فشل في تحميل البيانات');
      const data = await response.json();
      if (Array.isArray(data)) {
        setClients(data);
      } else {
        throw new Error('تنسيق البيانات غير صحيح');
      }
    } catch (err: any) {
      setClientsError('حدث خطأ أثناء تحميل العملاء.');
      console.error('Fetch clients error:', err);
    } finally {
      setIsLoadingClients(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setImages(prev => [...prev, ...newFiles]);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
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
          if (!ctx) { reject(new Error('Canvas context not available')); return; }
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
    if (!selectedClient) { setUploadError('يرجى اختيار العميل أولاً'); return; }
    if (images.length === 0) { setUploadError('يرجى اختيار صورة واحدة على الأقل'); return; }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      const compressedImages: string[] = [];
      for (const file of images) {
        compressedImages.push(await compressImage(file));
      }

      const payload = {
        rowIndex: selectedClient.rowIndex,
        clientName: selectedClient.name,
        images: compressedImages,
      };

      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });

      const result: AppsScriptResponse = await response.json();

      if (result.status === 'success') {
        setUploadSuccess(true);
        setTimeout(() => {
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
      setUploadError(`حدث خطأ أثناء الرفع: ${err.message || 'تأكد من الاتصال'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Select a client and close the popover
  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setComboboxOpen(false);
    setSearchQuery('');
  };

  // Filter clients based on search query
  const filteredClients = useMemo(() => {
    if (!searchQuery) return clients.slice(0, 50);
    const query = searchQuery.toLowerCase();
    const matches = clients.filter(c => c.name.toLowerCase().includes(query));
    return searchQuery.length < 2 ? matches.slice(0, 50) : matches;
  }, [clients, searchQuery]);

  return (
    <div dir="rtl" className="min-h-screen bg-background py-8 px-4 flex flex-col items-center">

      {/* Header */}
      <div className="w-full max-w-lg mb-8 text-center">
        <h1 className="text-2xl font-bold text-foreground">رفع صور العملاء</h1>
      </div>

      <div className="w-full max-w-lg flex flex-col gap-5">

        {/* Main Form Card */}
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 space-y-6">

            {/* ── Client Selection ── */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                العميل
              </label>

              <Popover.Root open={comboboxOpen} onOpenChange={setComboboxOpen}>
                <Popover.Trigger asChild>
                  <button
                    className={`w-full flex items-center justify-between bg-background border rounded-xl px-4 py-3.5 text-sm transition-colors touch-manipulation
                      ${selectedClient ? 'text-foreground border-input' : 'text-muted-foreground border-input/60'}
                      focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[52px]`}
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
                    {isLoadingClients
                      ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 opacity-60" />}
                  </button>
                </Popover.Trigger>

                <Popover.Portal>
                  <Popover.Content
                    className="z-50 w-[var(--radix-popover-trigger-width)] bg-popover border border-border rounded-xl shadow-lg overflow-hidden"
                    align="start"
                    sideOffset={4}
                    dir="rtl"
                    // Prevent popover from closing when touching/clicking inside
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    <Command className="w-full bg-popover" shouldFilter={false}>
                      {/* Search input */}
                      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                        <Command.Input
                          placeholder="ابحث عن عميل..."
                          value={searchQuery}
                          onValueChange={setSearchQuery}
                          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground py-2"
                          data-testid="input-client-search"
                          autoFocus
                        />
                        {searchQuery && (
                          <button
                            onPointerDown={(e) => { e.preventDefault(); setSearchQuery(''); }}
                            className="text-muted-foreground hover:text-foreground p-1 touch-manipulation"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <Command.List className="max-h-64 overflow-y-auto overscroll-contain">
                        {filteredClients.length === 0 && searchQuery ? (
                          <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                            لا يوجد عملاء مطابقين
                          </Command.Empty>
                        ) : (
                          <Command.Group>
                            {filteredClients.map((client) => (
                              <Command.Item
                                key={client.rowIndex}
                                value={client.name}
                                // onSelect handles keyboard Enter
                                onSelect={() => handleSelectClient(client)}
                                // onPointerDown handles mouse click + touch — prevents focus loss
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  handleSelectClient(client);
                                }}
                                className="flex items-center justify-between px-3 py-3 text-sm cursor-pointer select-none
                                  hover:bg-accent hover:text-accent-foreground
                                  aria-selected:bg-accent aria-selected:text-accent-foreground
                                  active:bg-accent/70 rounded-lg mx-1 my-0.5 min-h-[44px] touch-manipulation"
                                data-testid={`item-client-${client.rowIndex}`}
                              >
                                <span>{client.name}</span>
                                {selectedClient?.rowIndex === client.rowIndex && (
                                  <Check className="w-4 h-4 text-primary shrink-0 mr-2" />
                                )}
                              </Command.Item>
                            ))}
                          </Command.Group>
                        )}
                      </Command.List>

                      {!searchQuery && clients.length > 50 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border text-center">
                          اكتب للبحث في {clients.length.toLocaleString()} عميل
                        </div>
                      )}
                    </Command>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>

              {clientsError && (
                <div className="mt-2 text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{clientsError}</span>
                  <button
                    onClick={fetchClients}
                    className="underline mr-1 touch-manipulation"
                  >
                    إعادة المحاولة
                  </button>
                </div>
              )}
            </div>

            {/* ── Image Selection ── */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                الصور
              </label>

              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer touch-manipulation
                  ${images.length > 0 ? 'border-primary/40 bg-primary/5' : 'border-border active:bg-muted/70 hover:border-primary/50 hover:bg-muted/40'}`}
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone-area"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <ImageIcon className="w-7 h-7 text-primary" />
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
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  className="hidden"
                  data-testid="input-file"
                />
              </div>

              {/* Image Previews */}
              {imagePreviews.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {imagePreviews.map((preview, idx) => (
                    <div key={idx} className="relative rounded-xl overflow-hidden border border-border aspect-square bg-muted">
                      <img
                        src={preview}
                        alt={`Preview ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      {/* Always visible remove button — important for mobile */}
                      <button
                        onPointerDown={(e) => { e.stopPropagation(); removeImage(idx); }}
                        className="absolute top-1.5 left-1.5 bg-black/60 active:bg-black/80 text-white rounded-full p-1.5 touch-manipulation"
                        data-testid={`button-remove-image-${idx}`}
                        aria-label="حذف الصورة"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Errors & Success ── */}
            {uploadError && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{uploadError}</p>
              </div>
            )}

            {uploadSuccess && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-sm rounded-xl flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <p>تم الرفع بنجاح!</p>
              </div>
            )}
          </div>

          {/* Upload Button */}
          <div className="p-4 bg-muted/20 border-t border-border">
            <button
              onClick={handleUpload}
              disabled={isUploading || isLoadingClients}
              className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all touch-manipulation text-base
                ${isUploading || isLoadingClients
                  ? 'bg-primary/50 text-white cursor-not-allowed'
                  : 'bg-primary hover:bg-primary/90 active:scale-[0.98] text-primary-foreground shadow-sm'}`}
              data-testid="button-upload"
            >
              {isUploading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> جاري الرفع...</>
              ) : (
                <><Upload className="w-5 h-5" /> رفع الصور</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
