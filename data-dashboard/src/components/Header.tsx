import { Link } from '@tanstack/react-router'

import { useState } from 'react'
import {
  Home,
  Menu,
  X,
  Building2,
} from 'lucide-react'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <header className="p-4 flex items-center bg-slate-900 border-b border-slate-700/50 text-white shadow-lg sticky top-0 z-40">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>
        <div className="ml-4 flex items-center gap-2">
          <Building2 size={22} className="text-cyan-400" />
          <h1 className="text-lg font-bold text-white tracking-tight">
            <span className="text-white">Dubizzle </span>
            <span className="text-cyan-400">Real Estate</span>
            <span className="text-white"> Dashboard</span>
          </h1>
        </div>
      </header>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-slate-900 border-r border-slate-700/50 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-cyan-400" />
            <h2 className="text-base font-bold">Navigation</h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors mb-1"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-1',
            }}
          >
            <Home size={18} />
            <span className="font-medium text-sm">Dashboard</span>
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-700/50 text-xs text-gray-500">
          Dubizzle Egypt · Real Estate Analytics
        </div>
      </aside>
    </>
  )
}

