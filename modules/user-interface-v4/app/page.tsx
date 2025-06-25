"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { TabBar } from "@/components/tab-bar"
import { MainContent } from "@/components/main-content"
import { LeftSidebar } from "@/components/left-sidebar"
import { RightSidebar } from "@/components/right-sidebar"
import { Footer } from "@/components/footer"
import { Toast } from "@/components/toast"
import { Modal } from "@/components/modal"
import { MCPProvider } from "@/components/mcp-provider"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

export default function RecursiveIDE() {
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const [footerExpanded, setFooterExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState("project-1")
  const [layoutMode, setLayoutMode] = useState<"normal" | "split" | "swapped">("normal")
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: "info" | "success" | "error" }>>([])
  const [modal, setModal] = useState<{ open: boolean; title: string; content: string }>({
    open: false,
    title: "",
    content: "",
  })

  const addToast = (message: string, type: "info" | "success" | "error" = "info") => {
    const id = Date.now().toString()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }

  const showModal = (title: string, content: string) => {
    setModal({ open: true, title, content })
  }

  return (
    <MCPProvider>
      <div className="h-screen flex flex-col bg-gray-50">
        {/* Top Header */}
        <Header onSearch={(query) => addToast(`Searching: ${query}`)} />

        {/* Tab Bar */}
        <TabBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onNewTab={() => addToast("New tab created", "success")}
        />

        {/* Main Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Hide for admin tab */}
          {leftSidebarOpen && activeTab !== "admin" && (
            <LeftSidebar
              onToggle={() => setLeftSidebarOpen(!leftSidebarOpen)}
              onWorkflowUpdate={(step) => addToast(`Workflow: ${step}`, "info")}
            />
          )}

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col">
            {/* Left Sidebar Toggle Button (when closed) */}
            {!leftSidebarOpen && activeTab !== "admin" && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10"
                onClick={() => setLeftSidebarOpen(true)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}

            {/* Right Sidebar Toggle Button (when closed) */}
            {!rightSidebarOpen && layoutMode !== "swapped" && activeTab !== "admin" && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10"
                onClick={() => setRightSidebarOpen(true)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}

            <div className="flex-1 flex">
              {layoutMode === "swapped" && activeTab !== "admin" ? (
                <>
                  <RightSidebar
                    isMain={true}
                    onToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
                    onAppLaunch={(app) => addToast(`Launched: ${app}`, "success")}
                  />
                  <MainContent
                    layoutMode={layoutMode}
                    onLayoutChange={setLayoutMode}
                    onMessage={(msg) => addToast(`LLM: ${msg}`, "info")}
                    onShowModal={showModal}
                    activeTab={activeTab}
                  />
                </>
              ) : (
                <>
                  <MainContent
                    layoutMode={layoutMode}
                    onLayoutChange={setLayoutMode}
                    onMessage={(msg) => addToast(`LLM: ${msg}`, "info")}
                    onShowModal={showModal}
                    activeTab={activeTab}
                  />
                  {rightSidebarOpen && activeTab !== "admin" && (
                    <RightSidebar
                      isMain={false}
                      onToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
                      onAppLaunch={(app) => addToast(`Launched: ${app}`, "success")}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer - Hide for admin tab */}
        {activeTab !== "admin" && (
          <Footer
            expanded={footerExpanded}
            onToggle={() => setFooterExpanded(!footerExpanded)}
            onToolAdd={(tool) => addToast(`Added tool: ${tool}`, "success")}
            onToolExecute={(tool) => addToast(`Executing: ${tool}`, "info")}
          />
        )}

        {/* Toast Notifications */}
        {toasts.length > 0 && (
          <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-50 space-y-2">
            {toasts.map((toast) => (
              <Toast key={toast.id} message={toast.message} type={toast.type} />
            ))}
          </div>
        )}

        {/* Modal */}
        {modal.open && (
          <Modal
            title={modal.title}
            content={modal.content}
            onClose={() => setModal({ open: false, title: "", content: "" })}
          />
        )}
      </div>
    </MCPProvider>
  )
}
