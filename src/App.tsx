import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  QrCode, 
  ClipboardCheck, 
  Package, 
  Settings, 
  LogOut, 
  Camera, 
  X, 
  Save, 
  Filter,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Edit3,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  Timestamp,
  getDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { ref, uploadBytes, getDownloadURL, uploadString } from 'firebase/storage';
import { auth, db, storage } from './firebase';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, setError?: (e: Error) => void) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  if (setError) {
    setError(new Error(JSON.stringify(errInfo)));
  } else {
    throw new Error(JSON.stringify(errInfo));
  }
}

class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if ((this as any).state.hasError) {
      let errorMessage = "Algo salió mal.";
      const rawMessage = (this as any).state.error?.message || "";
      
      if (rawMessage && typeof rawMessage === 'string' && rawMessage.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(rawMessage);
          if (parsed.error && parsed.error.includes("permission-denied")) {
            errorMessage = "No tienes permisos suficientes para realizar esta acción o ver estos datos.";
          }
        } catch (e) {
          console.error("ErrorBoundary: Failed to parse JSON error message", e);
        }
      } else if (rawMessage) {
        errorMessage = rawMessage;
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border-t-4 border-unitec-red">
            <AlertCircle size={48} className="text-unitec-red mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Error de Aplicación</h2>
            <p className="text-gray-600 mb-6">{errorMessage}</p>
            <Button onClick={() => window.location.reload()} className="w-full">
              Reintentar
            </Button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

// --- Types ---
interface InventoryItem {
  id: string;
  name: string;
  category: 'Equipo' | 'Insumos' | 'Herramientas';
  brand: string;
  model: string;
  serialNumber: string;
  lab: string;
  location: string;
  description: string;
  observations: string;
  tag: string;
  qrCode: string;
  imageUrl: string;
  createdAt: any;
  updatedAt: any;
}

interface Review {
  id: string;
  lab: string;
  date: any;
  status: 'pending' | 'completed';
  notes: string;
  createdBy: string;
}

interface ReviewItem {
  id: string;
  reviewId: string;
  itemId: string;
  status: 'found' | 'missing' | 'damaged';
  notes: string;
  checkedAt: any;
}

interface Lab {
  id: string;
  name: string;
  description: string;
  createdAt: any;
}

interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'user';
  displayName: string;
}

// --- Components ---

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className = '', 
  disabled = false,
  type = 'button'
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'; 
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}) => {
  const variants = {
    primary: 'bg-unitec-blue text-white hover:bg-unitec-blue/90 shadow-sm',
    secondary: 'bg-white text-unitec-dark border border-gray-200 hover:bg-gray-50 shadow-sm',
    danger: 'bg-unitec-red text-white hover:bg-unitec-red/90 shadow-sm',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
    outline: 'bg-transparent text-unitec-blue border border-unitec-blue hover:bg-unitec-blue/5'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({ 
  label, 
  value, 
  onChange, 
  placeholder, 
  type = 'text', 
  required, 
  className = '',
  error
}: { 
  label?: string; 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void; 
  placeholder?: string;
  type?: string;
  required?: boolean;
  className?: string;
  error?: string;
}) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    {label && (
      <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
    )}
    {type === 'textarea' ? (
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className={`px-3 py-2 rounded-lg border ${error ? 'border-red-500' : 'border-gray-200'} focus:ring-2 focus:ring-unitec-blue/20 focus:border-unitec-blue outline-none transition-all min-h-[100px] text-sm`}
      />
    ) : (
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className={`px-3 py-2 rounded-lg border ${error ? 'border-red-500' : 'border-gray-200'} focus:ring-2 focus:ring-unitec-blue/20 focus:border-unitec-blue outline-none transition-all text-sm`}
      />
    )}
    {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
  </div>
);

const Select = ({ 
  label, 
  value, 
  onChange, 
  options, 
  required, 
  className = '',
  placeholder = 'Seleccionar...',
  error
}: { 
  label?: string; 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; 
  options: { value: string; label: string }[];
  required?: boolean;
  className?: string;
  placeholder?: string;
  error?: string;
}) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    {label && (
      <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
    )}
    <select
      value={value}
      onChange={onChange}
      required={required}
      className={`px-3 py-2 rounded-lg border ${error ? 'border-red-500' : 'border-gray-200'} focus:ring-2 focus:ring-unitec-blue/20 focus:border-unitec-blue outline-none transition-all text-sm bg-white h-[38px]`}
    >
      <option value="">{placeholder}</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
    {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
            <h3 className="text-xl font-bold text-unitec-dark">{title}</h3>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <X size={20} className="text-gray-500" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto flex-1">
            {children}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const ConfirmModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirmar', 
  cancelText = 'Cancelar',
  variant = 'danger'
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void; 
  title: string; 
  message: string; 
  confirmText?: string; 
  cancelText?: string;
  variant?: 'danger' | 'primary'
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title={title}>
    <div className="space-y-4">
      <p className="text-gray-600">{message}</p>
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <Button variant="ghost" onClick={onClose}>{cancelText}</Button>
        <Button variant={variant} onClick={() => { onConfirm(); onClose(); }}>{confirmText}</Button>
      </div>
    </div>
  </Modal>
);

// --- QR Scanner Component ---
const QRScanner = ({ onScan, onClose }: { onScan: (data: string) => void, onClose: () => void }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerId = "qr-reader";

  useEffect(() => {
    let isStarted = false;
    scannerRef.current = new Html5Qrcode(scannerId);
    
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    scannerRef.current.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        onScan(decodedText);
      },
      () => {}
    ).then(() => {
      isStarted = true;
    }).catch(err => {
      console.error("Error starting scanner:", err);
    });

    return () => {
      if (scannerRef.current) {
        const stopScanner = async () => {
          try {
            if (isStarted) {
              await scannerRef.current?.stop();
            }
          } catch (err: any) {
            // Ignore "Cannot stop, scanner is not running or paused" errors
            if (!err?.toString().includes("not running")) {
              console.error("Error stopping scanner:", err);
            }
          } finally {
            try {
              scannerRef.current?.clear();
            } catch (e) {}
          }
        };
        stopScanner();
      }
    };
  }, []);

  return <div id={scannerId} className="w-full h-full" />;
};

// --- Main Application ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'items' | 'reviews' | 'scanner' | 'labs'>('items');
  const [categoryFilter, setCategoryFilter] = useState<'Equipo' | 'Insumos' | 'Herramientas' | 'Todos'>('Todos');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [labFilter, setLabFilter] = useState('Todos');
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [selectedReviewItems, setSelectedReviewItems] = useState<ReviewItem[]>([]);
  const [isReviewDetailsModalOpen, setIsReviewDetailsModalOpen] = useState(false);
  const [formError, setFormError] = useState<Record<string, string>>({});
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'primary';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'danger'
  });
  const [isLabModalOpen, setIsLabModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<InventoryItem> | null>(null);
  const [editingLab, setEditingLab] = useState<Partial<Lab> | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [activeReview, setActiveReview] = useState<Review | null>(null);
  const [reviewItems, setReviewItems] = useState<Record<string, ReviewItem>>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [errorToThrow, setErrorToThrow] = useState<Error | null>(null);
  if (errorToThrow) throw errorToThrow;

  const isAdmin = userProfile?.role === 'admin';

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        setUser(user);
        if (user) {
          // Ensure user profile exists
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            setUserProfile({ uid: user.uid, ...userSnap.data() } as UserProfile);
          } else {
            // Default role is user, unless it's the specific admin email
            const role = user.email === 'cam.unitec@gmail.com' ? 'admin' : 'user';
            const newProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              role: role,
              displayName: user.displayName || 'Usuario'
            };
            await setDoc(userRef, {
              email: newProfile.email,
              role: newProfile.role,
              displayName: newProfile.displayName
            });
            setUserProfile(newProfile);
          }
        } else {
          setUserProfile(null);
        }
      } catch (error) {
        console.error("Auth Listener Error:", error);
        // Don't throw here to avoid crashing the whole app on auth check, 
        // but maybe show a message if needed.
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Items Listener
  useEffect(() => {
    if (!user) return;
    console.log("Setting up items listener...");
    const path = 'items';
    // Remove orderBy for now to be more robust against missing fields
    const q = query(collection(db, path)); 
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`Items snapshot received: ${snapshot.size} items`);
      const itemsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      // Sort in memory
      itemsList.sort((a, b) => {
        const dateA = (a.createdAt as any)?.toMillis?.() || 0;
        const dateB = (b.createdAt as any)?.toMillis?.() || 0;
        return dateB - dateA;
      });
      setItems(itemsList);
    }, (error) => {
      console.error("Items Listener Error:", error);
      handleFirestoreError(error, OperationType.GET, path, setErrorToThrow);
    });
    return () => unsubscribe();
  }, [user]);

  // Labs Listener
  useEffect(() => {
    if (!user) return;
    console.log("Setting up labs listener...");
    const path = 'labs';
    const q = query(collection(db, path));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`Labs snapshot received: ${snapshot.size} labs`);
      const labsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lab));
      labsList.sort((a, b) => a.name.localeCompare(b.name));
      setLabs(labsList);
    }, (error) => {
      console.error("Labs Listener Error:", error);
      handleFirestoreError(error, OperationType.GET, path, setErrorToThrow);
    });
    return () => unsubscribe();
  }, [user]);

  // Reviews Listener
  useEffect(() => {
    if (!user) return;
    const path = 'reviews';
    const q = query(collection(db, path), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reviewsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review));
      setReviews(reviewsList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path, setErrorToThrow);
    });
    return () => unsubscribe();
  }, [user]);

  // Selected Review Items Listener
  useEffect(() => {
    if (!selectedReview) {
      setSelectedReviewItems([]);
      return;
    }
    const path = `reviews/${selectedReview.id}/items`;
    const q = query(collection(db, path), orderBy('checkedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReviewItem));
      setSelectedReviewItems(itemsList);
    }, (error) => {
      // If it's a permission error or something else, we handle it
      console.error("Review Items Listener Error:", error);
    });
    return () => unsubscribe();
  }, [selectedReview]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const testFirestore = async () => {
    console.log("Testing Firestore connection...");
    try {
      const testRef = doc(db, 'test_connection', 'test');
      await setDoc(testRef, { 
        timestamp: serverTimestamp(),
        user: user?.email || 'unknown'
      });
      console.log("Firestore test successful");
      
      console.log("Testing Storage upload (tiny file)...");
      const storageTestRef = ref(storage, `test/test_${Date.now()}.txt`);
      await uploadString(storageTestRef, "test connection content");
      console.log("Storage test successful");
      
      alert("Conexión a Firestore y Storage exitosa.");
    } catch (error) {
      console.error("Firebase test failed:", error);
      alert("Error al conectar con Firebase: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleLogout = () => signOut(auth);

  const compressImage = (file: File, maxWidth = 800, maxHeight = 800, quality = 0.6): Promise<{ blob: Blob, base64: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onload = (event) => {
        const blob = new Blob([event.target?.result as ArrayBuffer], { type: file.type });
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height *= maxWidth / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width *= maxHeight / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          const base64 = canvas.toDataURL('image/jpeg', quality);
          
          canvas.toBlob(
            (resultBlob) => {
              if (resultBlob) {
                resolve({ blob: resultBlob, base64 });
              } else {
                reject(new Error('Error al convertir imagen a Blob'));
              }
            },
            'image/jpeg',
            quality
          );
          URL.revokeObjectURL(img.src);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("handleSaveItem started");
    
    if (!isAdmin) {
      console.error("User is not admin");
      alert("No tienes permisos de administrador para guardar items.");
      return;
    }
    
    if (isUploading || !editingItem) {
      console.log("Already uploading or no item editing");
      return;
    }
    
    setFormError({});
    const errors: Record<string, string> = {};
    
    // Trim all string fields
    const name = editingItem.name?.trim() || '';
    const lab = editingItem.lab?.trim() || '';
    const category = editingItem.category || '';
    const tag = editingItem.tag?.trim() || '';
    const brand = editingItem.brand?.trim() || '';
    const model = editingItem.model?.trim() || '';
    const serialNumber = editingItem.serialNumber?.trim() || '';
    const location = editingItem.location?.trim() || '';
    const description = editingItem.description?.trim() || '';
    const observations = editingItem.observations?.trim() || '';

    // Validation - All fields are mandatory
    if (!name) errors.name = "El nombre del item es obligatorio";
    if (!lab) errors.lab = "El laboratorio es obligatorio";
    if (!category) errors.category = "La categoría es obligatoria";
    if (!tag) errors.tag = "La etiqueta es obligatoria";
    if (!brand) errors.brand = "La marca es obligatoria";
    if (!model) errors.model = "El modelo es obligatorio";
    if (!serialNumber) errors.serialNumber = "El número de serie es obligatorio";
    if (!location) errors.location = "La localización es obligatoria";
    if (!description) errors.description = "La descripción es obligatoria";
    if (!observations) errors.observations = "Las observaciones son obligatorias";
    if (!imageFile && !editingItem.imageUrl) errors.image = "La imagen es obligatoria";

    if (Object.keys(errors).length > 0) {
      console.log("Validation errors:", errors);
      setFormError(errors);
      return;
    }

    setIsUploading(true);
    try {
      let finalImageUrl = editingItem.imageUrl || '';

      if (imageFile) {
        console.log("Starting image upload process...");
        try {
          console.log("Compressing image...");
          const { blob, base64 } = await compressImage(imageFile);
          console.log(`Compression complete. Original: ${(imageFile.size / 1024).toFixed(2)}KB, Compressed: ${(blob.size / 1024).toFixed(2)}KB`);
          
          const storageRef = ref(storage, `items/${Date.now()}_${imageFile.name.replace(/\.[^/.]+$/, "")}.jpg`);
          console.log("Attempting Storage upload...");

          try {
            // Attempt standard upload with a reasonable timeout (20s)
            const uploadTask = uploadBytes(storageRef, blob);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('timeout')), 20000)
            );
            
            const snapshot = await Promise.race([uploadTask, timeoutPromise]) as any;
            finalImageUrl = await getDownloadURL(snapshot.ref);
            console.log("Storage upload successful:", finalImageUrl);
          } catch (storageError: any) {
            console.warn("Storage upload failed or timed out, falling back to Base64 in Firestore:", storageError);
            // Fallback: Store the Base64 string directly in Firestore
            // This is very reliable as it uses the same connection as the data
            finalImageUrl = base64;
          }
        } catch (error: any) {
          console.error("Image processing error:", error);
          setFormError({ image: "Error al procesar la imagen: " + error.message });
          setIsUploading(false);
          return;
        }
      }

      const { id } = editingItem;
      
      const itemData = {
        name,
        lab,
        tag,
        category,
        brand,
        model,
        serialNumber,
        location,
        description,
        observations,
        imageUrl: finalImageUrl,
        updatedAt: serverTimestamp(),
        qrCode: tag,
      };

      console.log("Saving to Firestore...", id ? "Update" : "Create");
      
      // Add a timeout for Firestore write as well
      const firestorePromise = id 
        ? updateDoc(doc(db, 'items', id), itemData)
        : addDoc(collection(db, 'items'), { ...itemData, createdAt: serverTimestamp() });

      const firestoreTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('La base de datos está tardando demasiado en responder. Por favor, verifica tu conexión.')), 30000)
      );

      await Promise.race([firestorePromise, firestoreTimeout]);
      console.log("Firestore save successful");

      setIsItemModalOpen(false);
      setEditingItem(null);
      setImageFile(null);
      setFormError({});
    } catch (error) {
      console.error("Save Error:", error);
      handleFirestoreError(error, editingItem.id ? OperationType.UPDATE : OperationType.CREATE, 'items', setErrorToThrow);
    } finally {
      setIsUploading(false);
      console.log("handleSaveItem finished");
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!isAdmin) return;
    
    setConfirmConfig({
      isOpen: true,
      title: 'Eliminar Item',
      message: '¿Estás seguro de que deseas eliminar este item? Esta acción no se puede deshacer.',
      variant: 'danger',
      onConfirm: async () => {
        const path = `items/${id}`;
        try {
          await deleteDoc(doc(db, 'items', id));
          setSelectedItem(null);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, path, setErrorToThrow);
        }
      }
    });
  };

  const handleScan = (data: string | null) => {
    if (data) {
      const foundItem = items.find(item => item.qrCode === data || item.tag === data);
      if (foundItem) {
        setSelectedItem(foundItem);
        setIsScannerOpen(false);
      }
    }
  };

  const handleSaveLab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!editingLab?.name) return;

    try {
      if (editingLab.id) {
        const path = `labs/${editingLab.id}`;
        try {
          await updateDoc(doc(db, 'labs', editingLab.id), {
            name: editingLab.name,
            description: editingLab.description || '',
            updatedAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path, setErrorToThrow);
        }
      } else {
        const path = 'labs';
        try {
          await addDoc(collection(db, 'labs'), {
            name: editingLab.name,
            description: editingLab.description || '',
            createdAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path, setErrorToThrow);
        }
      }
      setIsLabModalOpen(false);
      setEditingLab(null);
    } catch (error) {
      console.error("Save Lab Error:", error);
    }
  };

  const handleDeleteLab = async (id: string) => {
    if (!isAdmin) return;
    if (confirm('¿Estás seguro de eliminar este laboratorio?')) {
      const path = `labs/${id}`;
      try {
        await deleteDoc(doc(db, 'labs', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path, setErrorToThrow);
      }
    }
  };

  const startReview = async (lab: string) => {
    const newReview = {
      lab,
      date: serverTimestamp(),
      status: 'pending' as const,
      notes: '',
      createdBy: user?.email || 'unknown'
    };
    const path = 'reviews';
    try {
      const docRef = await addDoc(collection(db, path), newReview);
      setActiveReview({ id: docRef.id, ...newReview });
      setReviewItems({});
      setView('items');
      setLabFilter(lab);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path, setErrorToThrow);
    }
  };

  const markItemInReview = async (itemId: string, status: 'found' | 'missing' | 'damaged') => {
    if (!activeReview) return;
    
    const reviewItemData = {
      reviewId: activeReview.id,
      itemId,
      status,
      checkedAt: serverTimestamp(),
      notes: ''
    };

    const path = `reviews/${activeReview.id}/items`;
    try {
      await addDoc(collection(db, path), reviewItemData);
      setReviewItems(prev => ({
        ...prev,
        [itemId]: { id: 'temp', ...reviewItemData } as ReviewItem
      }));
      setSelectedItem(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path, setErrorToThrow);
    }
  };

  const finishReview = async () => {
    if (!activeReview) return;
    const path = `reviews/${activeReview.id}`;
    try {
      await updateDoc(doc(db, 'reviews', activeReview.id), { status: 'completed' });
      setActiveReview(null);
      setReviewItems({});
      setView('reviews');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path, setErrorToThrow);
    }
  };

  const labOptions = ['Todos', ...labs.map(l => l.name)];
  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         item.tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.brand.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLab = labFilter === 'Todos' || item.lab === labFilter;
    const matchesCategory = categoryFilter === 'Todos' || item.category === categoryFilter;
    return matchesSearch && matchesLab && matchesCategory;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-unitec-blue"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-unitec-gray flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border-t-4 border-unitec-blue"
        >
          <div className="mb-8 flex justify-center">
            <img 
              src="https://lh3.googleusercontent.com/sitesv/APaQ0SQSD-p6o68UHM8c0tRfIYUFJVqVHVYgRvbcNpgAlWi9zuiccAESzAtvQjm-xG15AmXFXD1V794Yi8UpAAyv-8Q0xMV7HyHEu9hTBQcFGotuUutZd5dXO8qkYBZxJ_GCz-kt5Zqqgx1QdJd-T3SKgGbG78sSSrLW64W7edB9feyEImG4qLn8bGPWfYg=w16383" 
              alt="Unitec Logo" 
              className="h-20 object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-2xl font-bold text-unitec-dark mb-2">Sistema de Gestión de Inventario</h1>
          <p className="text-gray-500 mb-8">Gestión profesional de equipo, insumos y herramientas para laboratorios.</p>
          <Button onClick={handleLogin} className="w-full py-3 text-lg">
            Iniciar con Google
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-unitec-gray text-unitec-dark font-sans">
        {/* Sidebar / Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-around items-center z-40 md:top-0 md:bottom-auto md:flex-col md:w-20 md:h-full md:border-t-0 md:border-r">
          <div className="hidden md:flex mb-8 mt-4">
            <img 
              src="https://lh3.googleusercontent.com/sitesv/APaQ0SQSD-p6o68UHM8c0tRfIYUFJVqVHVYgRvbcNpgAlWi9zuiccAESzAtvQjm-xG15AmXFXD1V794Yi8UpAAyv-8Q0xMV7HyHEu9hTBQcFGotuUutZd5dXO8qkYBZxJ_GCz-kt5Zqqgx1QdJd-T3SKgGbG78sSSrLW64W7edB9feyEImG4qLn8bGPWfYg=w16383" 
              alt="Unitec Logo" 
              className="w-12 h-12 object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <button 
            onClick={() => setView('items')}
            className={`p-2 rounded-xl transition-all ${view === 'items' ? 'bg-unitec-blue/10 text-unitec-blue' : 'text-gray-400 hover:text-gray-600'}`}
            title="Inventario"
          >
            <Package size={24} />
          </button>
          <button 
            onClick={() => setView('reviews')}
            className={`p-2 rounded-xl transition-all ${view === 'reviews' ? 'bg-unitec-blue/10 text-unitec-blue' : 'text-gray-400 hover:text-gray-600'}`}
            title="Revisiones"
          >
            <ClipboardCheck size={24} />
          </button>
          {isAdmin && (
            <button 
              onClick={() => setView('labs')}
              className={`p-2 rounded-xl transition-all ${view === 'labs' ? 'bg-unitec-blue/10 text-unitec-blue' : 'text-gray-400 hover:text-gray-600'}`}
              title="Laboratorios"
            >
              <Settings size={24} />
            </button>
          )}
          <button 
            onClick={() => setIsScannerOpen(true)}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600"
            title="Escanear QR"
          >
            <QrCode size={24} />
          </button>
          <div className="md:mt-auto mb-4">
            <button onClick={handleLogout} className="p-2 rounded-xl text-gray-400 hover:text-unitec-red">
              <LogOut size={24} />
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <main className="pb-24 md:pb-8 md:pl-28 p-6 max-w-7xl mx-auto">
          {/* Top Header with Logo for Mobile */}
          <div className="md:hidden flex items-center justify-between mb-6">
            <img 
              src="https://lh3.googleusercontent.com/sitesv/APaQ0SQSD-p6o68UHM8c0tRfIYUFJVqVHVYgRvbcNpgAlWi9zuiccAESzAtvQjm-xG15AmXFXD1V794Yi8UpAAyv-8Q0xMV7HyHEu9hTBQcFGotuUutZd5dXO8qkYBZxJ_GCz-kt5Zqqgx1QdJd-T3SKgGbG78sSSrLW64W7edB9feyEImG4qLn8bGPWfYg=w16383" 
              alt="Unitec Logo" 
              className="h-10 object-contain"
              referrerPolicy="no-referrer"
            />
            <div className="text-right">
              <p className="text-xs font-bold text-unitec-blue">{userProfile?.displayName}</p>
              <div className="flex justify-end gap-1">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest">{userProfile?.role}</p>
                {isAdmin && <span className="text-[8px] bg-unitec-red text-white px-1 rounded font-bold">ADMIN</span>}
              </div>
            </div>
          </div>

          {/* Desktop User Info */}
          <div className="hidden md:flex justify-end mb-4">
            <div className="text-right">
              <p className="text-sm font-bold text-unitec-blue">{userProfile?.displayName}</p>
              <div className="flex justify-end gap-2 items-center">
                <p className="text-xs text-gray-400 uppercase tracking-widest">{userProfile?.role}</p>
                {isAdmin && <span className="text-[10px] bg-unitec-red text-white px-1.5 py-0.5 rounded font-bold">ADMIN</span>}
              </div>
            </div>
          </div>

          {/* Active Review Banner */}
          <AnimatePresence>
            {activeReview && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mb-6 bg-unitec-blue text-white p-4 rounded-2xl flex items-center justify-between shadow-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-lg">
                    <ClipboardCheck size={24} />
                  </div>
                  <div>
                    <p className="font-bold">Revisión en curso: {activeReview.lab}</p>
                    <p className="text-xs text-blue-100">Selecciona items para marcarlos como encontrados.</p>
                  </div>
                </div>
                <Button variant="secondary" onClick={finishReview} className="bg-white text-unitec-blue hover:bg-blue-50 border-none">
                  Finalizar Revisión
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Header */}
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-unitec-dark">
                {view === 'items' ? (categoryFilter === 'Todos' ? 'Inventario General' : `Inventario de ${categoryFilter}`) : view === 'reviews' ? 'Revisiones' : 'Laboratorios'}
              </h1>
              <p className="text-gray-500">
                {view === 'items' ? `${filteredItems.length} items en esta categoría` : view === 'reviews' ? 'Historial de auditorías' : `${labs.length} laboratorios configurados`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <Button variant="ghost" onClick={testFirestore} className="p-2">
                  <CheckCircle2 size={16} className="text-green-500" />
                </Button>
              )}
              {view === 'items' && isAdmin && (
                <Button onClick={() => { 
                  setEditingItem({ category: categoryFilter !== 'Todos' ? categoryFilter : 'Equipo' }); 
                  setIsItemModalOpen(true); 
                }}>
                  <Plus size={20} /> Nuevo Item
                </Button>
              )}
              {view === 'reviews' && (
                <Button onClick={() => startReview(labFilter === 'Todos' ? (labs[0]?.name || 'Principal') : labFilter)}>
                  <Plus size={20} /> Nueva Revisión
                </Button>
              )}
              {view === 'labs' && isAdmin && (
                <Button onClick={() => { setEditingLab({}); setIsLabModalOpen(true); }}>
                  <Plus size={20} /> Nuevo Laboratorio
                </Button>
              )}
            </div>
          </header>

          {view === 'items' && (
            <div className="space-y-6">
              {/* Filters */}
              <div className="flex flex-col gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Buscar por nombre, marca o etiqueta..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-unitec-blue outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Filter size={18} className="text-gray-400" />
                    <select 
                      value={labFilter}
                      onChange={(e) => setLabFilter(e.target.value)}
                      className="bg-gray-50 border-none rounded-lg px-3 py-2 focus:ring-2 focus:ring-unitec-blue outline-none min-w-[150px]"
                    >
                      {labOptions.map(lab => <option key={lab} value={lab}>{lab}</option>)}
                    </select>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {['Todos', 'Equipo', 'Insumos', 'Herramientas'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat as any)}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                        categoryFilter === cat 
                          ? 'bg-unitec-blue text-white shadow-md' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {cat === 'Todos' ? 'Todo' : cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredItems.map(item => (
                  <motion.div 
                    layout
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group border-l-4 border-l-unitec-blue"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-unitec-blue/5 rounded-xl flex items-center justify-center text-unitec-blue group-hover:bg-unitec-blue group-hover:text-white transition-colors relative">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="w-full h-full object-cover rounded-xl" referrerPolicy="no-referrer" />
                        ) : (
                          <Package size={24} />
                        )}
                        {activeReview && reviewItems[item.id] && (
                          <div className="absolute -top-1 -right-1 bg-green-500 text-white rounded-full p-0.5 border-2 border-white">
                            <CheckCircle2 size={12} />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="px-2.5 py-1 bg-gray-100 text-unitec-blue text-xs font-bold rounded-full uppercase tracking-wider">
                          {item.tag}
                        </span>
                        <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
                          {item.category}
                        </span>
                      </div>
                    </div>
                    <h3 className="font-bold text-lg text-unitec-dark mb-1">{item.name}</h3>
                    <p className="text-sm text-gray-500 mb-4 line-clamp-1">{item.brand} {item.model}</p>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Settings size={12} /> {item.lab}
                      </span>
                      <span className="flex items-center gap-1">
                        <AlertCircle size={12} /> {item.location}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {view === 'reviews' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600">Fecha</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600">Laboratorio</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600">Estado</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600">Responsable</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reviews.map(review => (
                    <tr key={review.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {review.date?.toDate().toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">{review.lab}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                          review.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {review.status === 'completed' ? 'Completado' : 'Pendiente'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{review.createdBy}</td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => {
                            setSelectedReview(review);
                            setIsReviewDetailsModalOpen(true);
                          }}
                          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                          <ChevronRight size={18} className="text-gray-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {view === 'labs' && isAdmin && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {labs.map(lab => (
                <div key={lab.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-unitec-dark mb-2">{lab.name}</h3>
                    <p className="text-sm text-gray-500 mb-4">{lab.description || 'Sin descripción'}</p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => { setEditingLab(lab); setIsLabModalOpen(true); }}>
                      <Edit3 size={16} />
                    </Button>
                    <Button variant="danger" onClick={() => handleDeleteLab(lab.id)}>
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Review Details Modal */}
        <Modal
          isOpen={isReviewDetailsModalOpen}
          onClose={() => {
            setIsReviewDetailsModalOpen(false);
            setSelectedReview(null);
          }}
          title={`Detalles de Revisión - ${selectedReview?.lab}`}
        >
          {selectedReview && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Fecha</p>
                  <p className="font-medium">{selectedReview.date?.toDate().toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Responsable</p>
                  <p className="font-medium">{selectedReview.createdBy}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Estado</p>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                    selectedReview.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {selectedReview.status === 'completed' ? 'Completado' : 'Pendiente'}
                  </span>
                </div>
                {selectedReview.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Notas de Revisión</p>
                    <p className="text-sm text-gray-600 bg-white p-3 rounded-lg border border-gray-100">{selectedReview.notes}</p>
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-bold text-unitec-dark mb-4 flex items-center gap-2">
                  <Package size={20} className="text-unitec-blue" />
                  Equipos Revisados ({selectedReviewItems.length})
                </h4>
                <div className="space-y-3">
                  {selectedReviewItems.length === 0 ? (
                    <p className="text-sm text-gray-500 italic p-4 text-center bg-gray-50 rounded-xl">No se registraron items en esta revisión.</p>
                  ) : (
                    selectedReviewItems.map(reviewItem => {
                      const item = items.find(i => i.id === reviewItem.itemId);
                      return (
                        <div key={reviewItem.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                              {item?.imageUrl ? (
                                <img src={item.imageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <Package size={20} className="text-gray-400" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900">{item?.name || 'Item no encontrado'}</p>
                              <p className="text-[10px] text-gray-400 font-mono uppercase">{item?.tag || reviewItem.itemId}</p>
                              {reviewItem.notes && (
                                <p className="text-[10px] text-orange-600 italic mt-1 bg-orange-50 px-2 py-0.5 rounded-md inline-block">
                                  Nota: {reviewItem.notes}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              reviewItem.status === 'found' ? 'bg-green-100 text-green-700' : 
                              reviewItem.status === 'missing' ? 'bg-red-100 text-red-700' : 
                              'bg-orange-100 text-orange-700'
                            }`}>
                              {reviewItem.status === 'found' ? 'Encontrado' : 
                               reviewItem.status === 'missing' ? 'Faltante' : 'Dañado'}
                            </span>
                            <p className="text-[10px] text-gray-400">{reviewItem.checkedAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* Item Details Modal */}
        <Modal 
          isOpen={!!selectedItem} 
          onClose={() => setSelectedItem(null)} 
          title="Detalles del Item"
        >
          {selectedItem && (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex-1 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Nombre</p>
                      <p className="font-medium">{selectedItem.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Etiqueta</p>
                      <p className="font-medium">{selectedItem.tag}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Marca</p>
                      <p className="font-medium">{selectedItem.brand || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Modelo</p>
                      <p className="font-medium">{selectedItem.model || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Serie</p>
                      <p className="font-medium">{selectedItem.serialNumber || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Categoría</p>
                      <p className="font-medium">{selectedItem.category || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Laboratorio</p>
                      <p className="font-medium">{selectedItem.lab}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Localización</p>
                    <p className="font-medium">{selectedItem.location || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Descripción</p>
                    <p className="text-sm text-gray-600">{selectedItem.description || 'Sin descripción'}</p>
                  </div>
                </div>
                <div className="w-full md:w-48 flex flex-col items-center gap-4">
                  <div className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
                    <QRCodeSVG value={selectedItem.qrCode} size={128} />
                  </div>
                  <p className="text-[10px] text-gray-400 font-mono">{selectedItem.qrCode}</p>
                  <div className="flex gap-2 w-full">
                    {activeReview && !reviewItems[selectedItem.id] ? (
                      <Button 
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        onClick={() => markItemInReview(selectedItem.id, 'found')}
                      >
                        <CheckCircle2 size={16} /> Marcar como Encontrado
                      </Button>
                    ) : (
                      <>
                        {isAdmin && (
                          <>
                            <Button 
                              variant="secondary" 
                              className="flex-1"
                              onClick={() => { setEditingItem(selectedItem); setSelectedItem(null); setIsItemModalOpen(true); }}
                            >
                              <Edit3 size={16} /> Editar
                            </Button>
                            <Button 
                              variant="danger" 
                              className="p-2"
                              onClick={() => handleDeleteItem(selectedItem.id)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Modal>

        <Modal 
          isOpen={isItemModalOpen} 
          onClose={() => { setIsItemModalOpen(false); setFormError({}); setImageFile(null); }} 
          title={editingItem?.id ? 'Editar Item' : 'Nuevo Item'}
        >
          <form onSubmit={handleSaveItem} className="space-y-6">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1 space-y-4">
                <Input 
                  label="Nombre del Item" 
                  required 
                  value={editingItem?.name || ''} 
                  onChange={e => setEditingItem({...editingItem, name: e.target.value})} 
                  placeholder="Ej: Microscopio Binocular"
                  error={formError.name}
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Select 
                    label="Categoría"
                    required
                    value={editingItem?.category || ''} 
                    onChange={e => setEditingItem({...editingItem, category: e.target.value as any})}
                    options={[
                      { value: 'Equipo', label: 'Equipo' },
                      { value: 'Insumos', label: 'Insumos' },
                      { value: 'Herramientas', label: 'Herramientas' }
                    ]}
                    placeholder="Seleccionar Categoría"
                    error={formError.category}
                  />
                  <Input 
                    label="Etiqueta (Tag)" 
                    required 
                    value={editingItem?.tag || ''} 
                    onChange={e => setEditingItem({...editingItem, tag: e.target.value})} 
                    placeholder="Ej: MIC-001"
                    error={formError.tag}
                  />
                  <Select 
                    label="Laboratorio"
                    required
                    value={editingItem?.lab || ''} 
                    onChange={e => setEditingItem({...editingItem, lab: e.target.value})}
                    options={labs.map(lab => ({ value: lab.name, label: lab.name }))}
                    placeholder="Seleccionar Laboratorio"
                    error={formError.lab}
                  />
                </div>
              </div>

              <div className="w-full md:w-48 flex flex-col gap-4">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  Imagen <span className="text-red-500">*</span>
                </label>
                <div className={`aspect-square bg-gray-50 border border-dashed ${formError.image ? 'border-red-500' : 'border-gray-300'} rounded-xl flex items-center justify-center overflow-hidden relative group`}>
                  {imageFile ? (
                    <img src={URL.createObjectURL(imageFile)} alt="Preview" className="w-full h-full object-cover" />
                  ) : editingItem?.imageUrl ? (
                    <img src={editingItem.imageUrl} alt="Current" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center p-4">
                      <ImageIcon className="text-gray-300 mx-auto mb-2" size={32} />
                      <p className="text-[10px] text-gray-400">Sin imagen</p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button 
                      variant="primary" 
                      type="button"
                      className="text-xs py-1 px-2 h-auto"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Cambiar
                    </Button>
                  </div>
                </div>
                {formError.image && <span className="text-xs text-red-500 font-medium">{formError.image}</span>}
                <Button 
                  variant="outline" 
                  type="button"
                  className="text-xs py-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera size={14} /> Subir o Tomar Foto
                </Button>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setImageFile(file);
                  }}
                />
              </div>
            </div>

            <div className="space-y-4">
              <Input 
                label="Descripción" 
                type="textarea"
                required
                value={editingItem?.description || ''} 
                onChange={e => setEditingItem({...editingItem, description: e.target.value})} 
                placeholder="Descripción detallada del item..."
                error={formError.description}
              />
              <Input 
                label="Observaciones" 
                type="textarea"
                required
                value={editingItem?.observations || ''} 
                onChange={e => setEditingItem({...editingItem, observations: e.target.value})} 
                placeholder="Notas adicionales, estado actual, etc."
                error={formError.observations}
              />
            </div>

            <details className="group">
              <summary className="text-sm font-medium text-unitec-blue cursor-pointer hover:underline mb-4 list-none flex items-center gap-2">
                <Plus size={14} className="group-open:rotate-45 transition-transform" />
                Información Técnica Adicional
              </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <Input 
                  label="Marca" 
                  required
                  value={editingItem?.brand || ''} 
                  onChange={e => setEditingItem({...editingItem, brand: e.target.value})} 
                  placeholder="Ej: Nikon"
                  error={formError.brand}
                />
                <Input 
                  label="Modelo" 
                  required
                  value={editingItem?.model || ''} 
                  onChange={e => setEditingItem({...editingItem, model: e.target.value})} 
                  placeholder="Ej: Eclipse E200"
                  error={formError.model}
                />
                <Input 
                  label="Número de Serie" 
                  required
                  value={editingItem?.serialNumber || ''} 
                  onChange={e => setEditingItem({...editingItem, serialNumber: e.target.value})} 
                  placeholder="S/N: 12345678"
                  error={formError.serialNumber}
                />
                <Input 
                  label="Localización" 
                  required
                  value={editingItem?.location || ''} 
                  onChange={e => setEditingItem({...editingItem, location: e.target.value})} 
                  placeholder="Ej: Estante A-4"
                  error={formError.location}
                />
              </div>
            </details>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button variant="ghost" type="button" onClick={() => { setIsItemModalOpen(false); setImageFile(null); setFormError({}); }}>Cancelar</Button>
              <Button type="submit" disabled={isUploading}>
                {isUploading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <Save size={20} />
                )}
                {isUploading ? 'Guardando...' : 'Guardar Item'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Lab Modal */}
        <Modal 
          isOpen={isLabModalOpen} 
          onClose={() => setIsLabModalOpen(false)} 
          title={editingLab?.id ? 'Editar Laboratorio' : 'Nuevo Laboratorio'}
        >
          <form onSubmit={handleSaveLab} className="space-y-6">
            <Input 
              label="Nombre del Laboratorio" 
              required 
              value={editingLab?.name || ''} 
              onChange={e => setEditingLab({...editingLab, name: e.target.value})} 
            />
            <Input 
              label="Descripción" 
              type="textarea"
              value={editingLab?.description || ''} 
              onChange={e => setEditingLab({...editingLab, description: e.target.value})} 
            />
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="ghost" onClick={() => setIsLabModalOpen(false)}>Cancelar</Button>
              <Button type="submit">
                <Save size={20} /> Guardar Laboratorio
              </Button>
            </div>
          </form>
        </Modal>

        {/* Scanner Modal */}
        <ConfirmModal 
          isOpen={confirmConfig.isOpen}
          onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
          onConfirm={confirmConfig.onConfirm}
          title={confirmConfig.title}
          message={confirmConfig.message}
          variant={confirmConfig.variant}
        />

        <Modal 
          isOpen={isScannerOpen} 
          onClose={() => setIsScannerOpen(false)} 
          title="Escanear Código QR"
        >
          <div className="flex flex-col items-center gap-6">
            <div className="w-full max-w-sm aspect-square bg-black rounded-2xl overflow-hidden relative">
              {isScannerOpen && (
                <QRScanner
                  onScan={handleScan}
                  onClose={() => setIsScannerOpen(false)}
                />
              )}
              <div className="absolute inset-0 border-2 border-indigo-500/50 rounded-2xl pointer-events-none z-10">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-indigo-500 animate-pulse"></div>
              </div>
            </div>
            <p className="text-sm text-gray-500 text-center">
              Apunta la cámara al código QR del equipo para identificarlo automáticamente.
            </p>
            <Button variant="secondary" onClick={() => setIsScannerOpen(false)}>
              Cerrar Escáner
            </Button>
          </div>
        </Modal>

        {/* Floating Action for Mobile */}
        <div className="fixed bottom-24 right-6 md:hidden">
          <Button 
            onClick={() => { 
              setEditingItem({ category: categoryFilter !== 'Todos' ? categoryFilter : 'Equipo' }); 
              setIsItemModalOpen(true); 
            }}
            className="w-14 h-14 rounded-full shadow-lg p-0"
          >
            <Plus size={28} />
          </Button>
        </div>
        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
          onConfirm={confirmConfig.onConfirm}
          title={confirmConfig.title}
          message={confirmConfig.message}
        />
      </div>
    </ErrorBoundary>
  );
}
