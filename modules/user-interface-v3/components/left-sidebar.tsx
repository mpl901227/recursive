"use client"

import { ChevronLeft, Play, Check, Clock, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

interface WorkflowStep {
  id: string
  title: string
  description: string
  status: "pending" | "running" | "completed" | "error"
  progress?: number
}

interface LeftSidebarProps {
  onToggle: () => void
  onWorkflowUpdate: (step: string) => void
}

export function LeftSidebar({ onToggle, onWorkflowUpdate }: LeftSidebarProps) {
  const [workflow] = useState<WorkflowStep[]>([
    {
      id: "1",
      title: "Analyze Requirements",
      description: "Understanding the project structure and requirements",
      status: "completed",
    },
    {
      id: "2",
      title: "Plan Architecture",
      description: "Designing the component structure and data flow",
      status: "running",
      progress: 65,
    },
    {
      id: "3",
      title: "Generate Components",
      description: "Creating React components and implementing features",
      status: "pending",
    },
    {
      id: "4",
      title: "Test & Validate",
      description: "Running tests and validating functionality",
      status: "pending",
    },
  ])

  const getStatusIcon = (status: WorkflowStep["status"]) => {
    switch (status) {
      case "completed":
        return <Check className="w-4 h-4 text-green-500" />
      case "running":
        return <Play className="w-4 h-4 text-blue-500 animate-pulse" />
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: WorkflowStep["status"]) => {
    switch (status) {
      case "completed":
        return "border-green-200 bg-green-50"
      case "running":
        return "border-blue-200 bg-blue-50 shadow-md"
      case "error":
        return "border-red-200 bg-red-50"
      default:
        return "border-gray-200 bg-gray-50"
    }
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
      {/* Header - 높이와 색상 통일 */}
      <div className="h-10 bg-gradient-to-r from-sky-50 to-green-50 border-b border-gray-200 flex items-center justify-end px-4">
        <Button variant="ghost" size="sm" onClick={onToggle}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* Workflow Steps */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {workflow.map((step, index) => (
            <div key={step.id} className="relative">
              {/* Connection Line */}
              {index < workflow.length - 1 && <div className="absolute left-6 top-12 w-0.5 h-8 bg-gray-200"></div>}

              {/* Step Card */}
              <div
                className={`
                  border rounded-lg p-4 cursor-pointer transition-all hover:shadow-sm
                  ${getStatusColor(step.status)}
                `}
                onClick={() => onWorkflowUpdate(step.title)}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-0.5">{getStatusIcon(step.status)}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 text-sm">{step.title}</h3>
                    <p className="text-xs text-gray-600 mt-1">{step.description}</p>

                    {/* Progress Bar */}
                    {step.status === "running" && step.progress && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>Progress</span>
                          <span>{step.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-gradient-to-r from-sky-300 to-green-300 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${step.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Overall Progress */}
        <div className="mt-6 p-4 bg-gradient-to-r from-sky-50 to-green-50 rounded-lg border border-sky-200">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">Overall Progress</span>
            <span className="text-sky-600 font-semibold">40%</span>
          </div>
          <div className="mt-2 w-full bg-white rounded-full h-2">
            <div
              className="bg-gradient-to-r from-sky-300 to-green-300 h-2 rounded-full transition-all duration-500"
              style={{ width: "40%" }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  )
}
