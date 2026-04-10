"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
  isDeleting,
}: DeleteConfirmationDialogProps) {
  const isBulk = count > 1;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isBulk ? "Delete Transactions" : "Delete Transaction"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isBulk
              ? `Delete ${count} selected transactions? This will recompute affected positions.`
              : "Delete this transaction? This will recompute affected positions."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 text-white hover:bg-red-700"
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {isDeleting ? "Deleting..." : isBulk ? `Delete ${count}` : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
