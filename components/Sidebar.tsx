import React, { useState, useEffect } from "react";
import { NAV_ITEMS, NAV_CATEGORIES, type NavItem, type NavCategory, type NavIconColor } from "../constants";
import { ChevronDown, LogOut } from "lucide-react";

const ICON_BOX_CLASS: Record<NavIconColor, string> = {
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  "violet-pink": "bg-gradient-to-br from-violet-500 to-pink-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  "blue-violet": "bg-gradient-to-br from-blue-500 to-violet-500",
  teal: "bg-teal-500",
  rose: "bg-rose-500",
  indigo: "bg-indigo-500",
};

interface SidebarProps {
  activeTab: string;
  setActiveTab: (id: string) => void;
  /** Kategorize menü (önerilen); verilmezse navItems kullanılır */
  navCategories?: NavCategory[];
  /** Düz menü listesi (antrenör paneli vb.) */
  navItems?: NavItem[];
  onLogout?: () => void;
  /** Mobilde sidebar açık mı (overlay) */
  mobileOpen?: boolean;
  /** Mobilde sidebar kapatma (menü tıklanınca çağrılır) */
  onClose?: () => void;
}

function renderNavItem(
  item: NavItem,
  activeTab: string,
  setActiveTab: (id: string) => void,
  expandedItem: string | null,
  setExpandedItem: (id: string | null) => void
) {
  const isActive = activeTab === item.id;
  const isExpanded = expandedItem === item.id;
  const hasSubItems = !!item.subItems?.length;
  const isParentActive = hasSubItems && item.subItems?.some((sub) => activeTab === sub.id);

  const handleClick = () => {
    if (hasSubItems) {
      setExpandedItem(expandedItem === item.id ? null : item.id);
    } else {
      setActiveTab(item.id);
    }
  };

  return (
    <div key={item.id} className="space-y-0.5">
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 group ${
          isActive || isParentActive
            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
            : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
        }`}
      >
        <div
          className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            item.iconColor && ICON_BOX_CLASS[item.iconColor]
              ? `${ICON_BOX_CLASS[item.iconColor]} text-white shadow-md`
              : "bg-white/10 text-slate-300 group-hover:bg-white/15"
          }`}
        >
          {React.cloneElement(item.icon as React.ReactElement<{ className?: string }>, {
            className: "w-5 h-5",
          })}
        </div>
        <span className="flex-1 text-left text-sm font-semibold tracking-tight truncate">
          {item.label}
        </span>
        {hasSubItems && (
          <ChevronDown
            className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        )}
      </button>

      {hasSubItems && isExpanded && (
        <div className="ml-4 pl-5 border-l border-white/10 space-y-0.5 py-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
          {item.subItems?.map((sub) => (
            <button
              key={sub.id}
              onClick={() => setActiveTab(sub.id)}
              className={`w-full flex items-center gap-2.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                activeTab === sub.id
                  ? "text-indigo-300 bg-indigo-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  activeTab === sub.id ? "bg-indigo-400" : "bg-slate-500 group-hover:bg-slate-400"
                }`}
              />
              {sub.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  navCategories,
  navItems = NAV_ITEMS,
  onLogout,
  mobileOpen = false,
  onClose,
}) => {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const useCategories = navCategories && navCategories.length > 0;

  const handleNav = (tab: string) => {
    setActiveTab(tab);
    onClose?.();
  };

  useEffect(() => {
    const list = useCategories
      ? navCategories.flatMap((c) => c.items)
      : (navItems as NavItem[]);
    const parent = list.find((item) =>
      item.subItems?.some((sub) => sub.id === activeTab)
    );
    if (parent) setExpandedItem((prev) => (prev === parent.id ? prev : parent.id));
  }, [activeTab, useCategories, navCategories, navItems]);

  return (
    <>
      {onClose && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Menüyü kapat"
          className={`fixed inset-0 bg-black/60 z-40 transition-opacity lg:hidden ${mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          onClick={onClose}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        />
      )}
      <aside
        className={`w-64 max-w-[85vw] h-screen flex flex-col fixed left-0 top-0 z-50 bg-[#020617] border-r border-white/5 transition-transform duration-300 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
      {/* Logo */}
      <div className="p-6 flex items-center gap-3 shrink-0">
        <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-500/25 rotate-3 hover:rotate-0 transition-transform cursor-pointer">
          S
        </div>
        <div>
          <span className="text-lg font-black tracking-tight text-white block leading-none">
            SatrançEdu
          </span>
          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
            Academy
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-4 custom-scrollbar">
        {useCategories ? (
          <div className="space-y-6">
            {navCategories.map((cat) => (
              <div key={cat.title}>
                <div className="flex items-center gap-2 px-3 mb-2">
                  {cat.icon && (
                    <span className="text-slate-500 opacity-80">
                      {cat.icon}
                    </span>
                  )}
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {cat.title}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {cat.items.map((item) =>
                    renderNavItem(
                      item,
                      activeTab,
                      handleNav,
                      expandedItem,
                      setExpandedItem
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 px-3 mb-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Menü
              </span>
            </div>
            {navItems.map((item) =>
              renderNavItem(
                item as NavItem,
                activeTab,
                handleNav,
                expandedItem,
                setExpandedItem
              )
            )}
          </div>
        )}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-white/5 shrink-0">
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 group"
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/5 group-hover:bg-red-500/10 transition-colors">
            <LogOut className="w-5 h-5" />
          </div>
          <span className="text-sm font-semibold">Çıkış Yap</span>
        </button>
      </div>
    </aside>
    </>
  );
};

export default Sidebar;
