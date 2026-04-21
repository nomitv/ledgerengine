import React from 'react';
import { AlertTriangle, Trash2, ArchiveX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function ConfirmDeleteModal({ isOpen, onClose, onConfirm, itemName = "this item" }) {
  const { user } = useAuth();
  
  if (!isOpen) return null;
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white dark:bg-surface-900 rounded-2xl shadow-xl overflow-hidden p-6 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20 mb-4">
          <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-500" />
        </div>
        
        <h3 className="text-lg font-bold text-surface-900 dark:text-white mb-2">Delete Confirmation</h3>
        <p className="text-sm text-surface-500 mb-6">
          Are you sure you want to delete {itemName}? This action may affect associated data.
        </p>

        <div className="flex flex-col gap-2">
          {!isSuperAdmin ? (
            <button onClick={() => { onConfirm(false); onClose(); }} className="btn-primary w-full justify-center bg-red-600 hover:bg-red-700">
               Delete
            </button>
          ) : (
            <>
              <button 
                onClick={() => { onConfirm(false); onClose(); }} 
                className="btn-primary w-full justify-center bg-orange-600 hover:bg-orange-700 text-white"
              >
                 <ArchiveX size={16} /> Soft Delete (Archive)
              </button>
              <button 
                onClick={() => { onConfirm(true); onClose(); }} 
                className="btn-primary w-full justify-center bg-red-700 hover:bg-red-800 text-white"
              >
                 <Trash2 size={16} /> Hard Delete (Permanent)
              </button>
            </>
          )}
          <button onClick={onClose} className="btn-secondary w-full justify-center mt-2">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
