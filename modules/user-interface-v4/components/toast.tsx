"use client"

import { CheckCircle, Info, AlertCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ToastProps {
  message: string
  type: "info" | "success" | "error"
  onClose?: () => void
}

export function Toast({ message, type, onClose }: ToastProps) {
  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Info className="w-4 h-4 text-blue-500" />
    }
  }

  const getBgColor = () => {
    switch (type) {
      case "success":
        return "bg-green-50 border-green-200"
      case "error":
        return "bg-red-50 border-red-200"
      default:
        return "bg-blue-50 border-blue-200"
    }
  }

  return (
    <div
      className={`
      flex items-center space-x-3 p-3 rounded-lg border shadow-sm animate-in slide-in-from-right-full
      ${getBgColor()}
    `}
    >
      {getIcon()}
      <span className="text-sm text-gray-800 flex-1">{message}</span>
      {onClose && (
        <Button variant="ghost" size="sm" className="w-4 h-4 p-0" onClick={onClose}>
          <X className="w-3 h-3" />
        </Button>
      )}
    </div>
  )
}
