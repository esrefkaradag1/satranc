import React, { useState, useEffect, useCallback } from "react";
import { NAV_ITEMS, NAV_CATEGORIES, type NavItem, type NavCategory, type NavIconColor } from "../constants";
import { ChevronDown, ChevronLeft, ChevronRight, LogOut } from "lucide-react";

function categoryKey(cat: NavCategory, index: number) {
  return `${cat.title}::${index}`;
}

function categoryContainsTab(cat: NavCategory, tab: string) {
  return cat.items.some(
    (item) => item.id === tab || item.subItems?.some((sub) => sub.id === tab),
  );
}

function isDefaultOpenCategory(cat: NavCategory) {
  const t = cat.title.trim().toLocaleLowerCase('tr-TR');
  return t === 'öğrenci işleri' || t === 'genel';
}

function buildDefaultCollapsedCategories(categories: NavCategory[]): Set<string> {
  const collapsed = new Set<string>();
  categories.forEach((cat, idx) => {
    if (!isDefaultOpenCategory(cat)) {
      collapsed.add(categoryKey(cat, idx));
    }
  });
  return collapsed;
}

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
  /** Masaüstünde yalnızca ikon şeridi ile başla (canlı ders vb.) */
  defaultIconOnly?: boolean;
  /** Masaüstü genişlik değişince (ana içerik margin'i için) */
  onDesktopExpandedChange?: (expanded: boolean) => void;
}

function renderNavItem(
  item: NavItem,
  activeTab: string,
  setActiveTab: (id: string) => void,
  expandedItem: string | null,
  setExpandedItem: (id: string | null) => void,
  iconOnly: boolean,
  onExpandDesktop: () => void,
) {
  const isActive = activeTab === item.id;
  const isExpanded = expandedItem === item.id;
  const hasSubItems = !!item.subItems?.length;
  const isParentActive = hasSubItems && item.subItems?.some((sub) => activeTab === sub.id);

  const handleClick = () => {
    if (hasSubItems) {
      if (iconOnly) {
        onExpandDesktop();
        setExpandedItem(item.id);
        return;
      }
      setExpandedItem(expandedItem === item.id ? null : item.id);
    } else {
      setActiveTab(item.id);
    }
  };

  return (
    <div key={item.id} className="space-y-0.5">
      <button
        type="button"
        onClick={handleClick}
        title={iconOnly ? item.label : undefined}
        className={`w-full flex items-center rounded-xl transition-all duration-200 group ${
          iconOnly ? "justify-center px-2 py-2.5" : "gap-3 px-3.5 py-2.5"
        } ${
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
        {!iconOnly && (
          <>
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
          </>
        )}
      </button>

      {hasSubItems && isExpanded && !iconOnly && (
        <div className="ml-4 pl-5 border-l border-white/10 space-y-0.5 py-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
          {item.subItems?.map((sub) => (
            <button
              key={sub.id}
              type="button"
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
  defaultIconOnly = false,
  onDesktopExpandedChange,
}) => {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [desktopExpanded, setDesktopExpanded] = useState(!defaultIconOnly);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set());
  const categoryDefaultsApplied = React.useRef(false);
  const knownCategoryKeysRef = React.useRef<Set<string>>(new Set());
  const useCategories = navCategories && navCategories.length > 0;
  const iconOnly = !desktopExpanded && !mobileOpen;

  const isCategoryExpanded = useCallback(
    (key: string) => !collapsedCategories.has(key),
    [collapsedCategories],
  );

  const toggleCategory = useCallback((key: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleNav = (tab: string) => {
    setActiveTab(tab);
    onClose?.();
  };

  const expandDesktop = () => setDesktopExpanded(true);

  useEffect(() => {
    setDesktopExpanded(!defaultIconOnly);
  }, [defaultIconOnly]);

  useEffect(() => {
    onDesktopExpandedChange?.(desktopExpanded);
  }, [desktopExpanded, onDesktopExpandedChange]);

  useEffect(() => {
    const list = useCategories
      ? navCategories.flatMap((c) => c.items)
      : (navItems as NavItem[]);
    const parent = list.find((item) =>
      item.subItems?.some((sub) => sub.id === activeTab)
    );
    if (parent) setExpandedItem((prev) => (prev === parent.id ? prev : parent.id));
  }, [activeTab, useCategories, navCategories, navItems]);

  useEffect(() => {
    if (!useCategories || !navCategories?.length) return;

    setCollapsedCategories((prev) => {
      if (!categoryDefaultsApplied.current) {
        categoryDefaultsApplied.current = true;
        const defaults = buildDefaultCollapsedCategories(navCategories);
        navCategories.forEach((cat, idx) => knownCategoryKeysRef.current.add(categoryKey(cat, idx)));
        return defaults;
      }

      const validKeys = new Set(navCategories.map((c, i) => categoryKey(c, i)));
      const next = new Set(prev);

      navCategories.forEach((cat, idx) => {
        const key = categoryKey(cat, idx);
        if (knownCategoryKeysRef.current.has(key)) return;
        knownCategoryKeysRef.current.add(key);
        if (!isDefaultOpenCategory(cat)) next.add(key);
      });

      for (const key of [...next]) {
        if (!validKeys.has(key)) next.delete(key);
      }
      for (const key of [...knownCategoryKeysRef.current]) {
        if (!validKeys.has(key)) knownCategoryKeysRef.current.delete(key);
      }

      return next;
    });
  }, [navCategories, useCategories]);

  /** Aktif sekmenin bulunduğu kategori otomatik açılsın */
  useEffect(() => {
    if (!useCategories || !navCategories?.length) return;
    const catIdx = navCategories.findIndex((cat) => categoryContainsTab(cat, activeTab));
    if (catIdx < 0) return;
    const key = categoryKey(navCategories[catIdx]!, catIdx);
    setCollapsedCategories((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, [activeTab, navCategories, useCategories]);

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
        className={`${
          mobileOpen || desktopExpanded ? "w-64" : "w-[4.5rem]"
        } max-w-[85vw] h-screen flex flex-col fixed left-0 top-0 z-50 bg-[#020617] border-r border-white/5 transition-[width,transform] duration-300 ease-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
      <button
        type="button"
        onClick={() => setDesktopExpanded((v) => !v)}
        title={desktopExpanded ? "Menüyü daralt" : "Menüyü genişlet"}
        className="hidden lg:flex absolute -right-3 top-7 z-10 w-6 h-6 rounded-full bg-slate-800 border border-white/10 text-slate-300 hover:text-white hover:bg-indigo-600 hover:border-indigo-500/40 items-center justify-center shadow-lg transition-colors"
      >
        {desktopExpanded ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {/* Logo */}
      <button
        type="button"
        onClick={() => {
          if (iconOnly) expandDesktop();
        }}
        title={iconOnly ? "Menüyü genişlet" : undefined}
        className={`shrink-0 flex items-center border-b border-white/5 transition-all ${
          iconOnly ? "justify-center p-4 w-full hover:bg-white/[0.03]" : "gap-3 p-6"
        }`}
      >
        <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-500/25 rotate-3 hover:rotate-0 transition-transform shrink-0">
          S
        </div>
        {!iconOnly && (
          <div className="text-left">
            <span className="text-lg font-black tracking-tight text-white block leading-none">
              SatrançEdu
            </span>
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
              Academy
            </span>
          </div>
        )}
      </button>

      {/* Nav */}
      <nav className={`flex-1 overflow-y-auto py-2 custom-scrollbar ${iconOnly ? "px-2" : "px-4"}`}>
        {useCategories ? (
          <div className={iconOnly ? "space-y-1" : "space-y-3"}>
            {navCategories.map((cat, catIdx) => {
              const catKey = categoryKey(cat, catIdx);
              const catOpen = iconOnly || isCategoryExpanded(catKey);
              const catHasActive = categoryContainsTab(cat, activeTab);

              return (
                <div key={catKey}>
                  {!iconOnly && (
                    <button
                      type="button"
                      onClick={() => toggleCategory(catKey)}
                      aria-expanded={catOpen}
                      className={`w-full flex items-center gap-2 px-3 mb-1.5 py-2 rounded-lg transition-colors group ${
                        catHasActive && !catOpen
                          ? "bg-indigo-500/10 hover:bg-indigo-500/15"
                          : "hover:bg-white/[0.04]"
                      }`}
                    >
                      {cat.icon && (
                        <span
                          className={`transition-colors ${
                            catHasActive ? "text-indigo-400" : "text-slate-500 opacity-80 group-hover:text-slate-400"
                          }`}
                        >
                          {cat.icon}
                        </span>
                      )}
                      <span
                        className={`flex-1 text-left text-[10px] font-bold uppercase tracking-widest transition-colors ${
                          catHasActive ? "text-indigo-300" : "text-slate-500 group-hover:text-slate-400"
                        }`}
                      >
                        {cat.title}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${
                          catOpen ? "rotate-180" : ""
                        } ${catHasActive ? "text-indigo-400" : "text-slate-500"}`}
                      />
                    </button>
                  )}
                  {catOpen && (
                    <div className="space-y-0.5">
                      {cat.items.map((item) =>
                        renderNavItem(
                          item,
                          activeTab,
                          handleNav,
                          expandedItem,
                          setExpandedItem,
                          iconOnly,
                          expandDesktop,
                        ),
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-0.5">
            {!iconOnly && (
              <div className="flex items-center gap-2 px-3 mb-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Menü
                </span>
              </div>
            )}
            {navItems.map((item) =>
              renderNavItem(
                item as NavItem,
                activeTab,
                handleNav,
                expandedItem,
                setExpandedItem,
                iconOnly,
                expandDesktop,
              )
            )}
          </div>
        )}
      </nav>

      {/* Logout */}
      <div className={`border-t border-white/5 shrink-0 ${iconOnly ? "p-2" : "p-4"}`}>
        <button
          type="button"
          onClick={onLogout}
          title={iconOnly ? "Çıkış Yap" : undefined}
          className={`w-full flex items-center rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 group ${
            iconOnly ? "justify-center px-2 py-2.5" : "gap-3 px-3.5 py-2.5"
          }`}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/5 group-hover:bg-red-500/10 transition-colors shrink-0">
            <LogOut className="w-5 h-5" />
          </div>
          {!iconOnly && <span className="text-sm font-semibold">Çıkış Yap</span>}
        </button>
      </div>
    </aside>
    </>
  );
};

export default Sidebar;
