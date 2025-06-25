"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ModalProps {
  title: string
  content: string
  onClose: () => void
}

export function Modal({ title, content, onClose }: ModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4">
          <p className="text-gray-600">{content}</p>
        </div>
        <div className="flex justify-end space-x-2 p-4 border-t border-gray-200">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onClose}>OK</Button>
        </div>
      </div>
    </div>
  )
}
