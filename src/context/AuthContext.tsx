import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, Tenant } from '../types';
import { api } from '../services/api';
import { canAccessMembershipModule, getUserWorkspace, getInitialViewForRole, hasPermission as _hasPermission } from '../utils/modulePermissions';
import type { UserWorkspace } from '../utils/modulePermissions';
import type { AppView } from './AppContext';

interface AuthContextType {
  user: User | null;
  activeTenant: Tenant | null;
  allowedTenants: Tenant[];
  isAuthenticated: boolean;
  isLoading: boolean;
  showOnboardingWizard: boolean;
  setShowOnboardingWizard: (show: boolean) => void;
  login: (credentials: { username?: string; email?: string; password: string }) => Promise<{ success: boolean; message?: string }>;
  register: (data: {
    fullName: string;
    email: string;
    phone?: string;
    companyName: string;
    taxNumber?: string;
    taxOffice?: string;
    city?: string;
    password: string;
  }) => Promise<{ success: boolean; message?: string; isFirstLogin?: boolean }>;
  logout: () => void;
  switchCompany: (tenantId: string) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  can: (action: 'view' | 'add' | 'edit' | 'delete' | 'print' | 'export', module: string) => boolean;
  /** FAZ 17: Modül erişim kontrolü — canAccessModule('platform-admin') */
  canAccessModule: (moduleId: string) => boolean;
  /** FAZ 17: Kullanıcının birincil çalışma alanı */
  userWorkspace: UserWorkspace;
  /** FAZ 17: Login sonrası yönlendirilecek başlangıç view'u */
  getInitialView: () => AppView;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [allowedTenants, setAllowedTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);

  const refreshProfile = async () => {
    try {
      const res = await api.getMe();
      if (res.success && res.user) {
        setUser(res.user);
        if (res.activeTenant) setActiveTenant(res.activeTenant);
        if (res.allowedTenants) setAllowedTenants(res.allowedTenants);
      }
    } catch (err) {
      console.warn('[AUTH] Session check fallback');
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('isbey_token');
        if (token) {
          await refreshProfile();
        } else {
          // Dev default fallback if no explicit logout
          const res = await api.getMe();
          if (res.success && res.user) {
            setUser(res.user);
            if (res.activeTenant) setActiveTenant(res.activeTenant);
            if (res.allowedTenants) setAllowedTenants(res.allowedTenants);
          }
        }
      } catch (err) {
        console.warn('Auth initialization check failed');
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = async (credentials: { username?: string; email?: string; password: string }): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await api.login(credentials);
      if (res.success && res.user) {
        if (res.token) {
          localStorage.setItem('isbey_token', res.token);
        }
        setUser(res.user);
        if (res.activeTenant) setActiveTenant(res.activeTenant);
        await refreshProfile();
        return { success: true, message: res.message };
      }
      return { success: false, message: res.message || 'Giriş başarısız.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Giriş yapılamadı.' };
    }
  };

  const register = async (data: {
    fullName: string;
    email: string;
    phone?: string;
    companyName: string;
    taxNumber?: string;
    taxOffice?: string;
    city?: string;
    password: string;
  }): Promise<{ success: boolean; message?: string; isFirstLogin?: boolean }> => {
    try {
      const res = await api.register(data);
      if (res.success && res.user) {
        if (res.token) {
          localStorage.setItem('isbey_token', res.token);
        }
        setUser(res.user);
        if (res.tenant) setActiveTenant(res.tenant);
        if (res.isFirstLogin) {
          setShowOnboardingWizard(true);
        }
        await refreshProfile();
        return { success: true, message: res.message, isFirstLogin: res.isFirstLogin };
      }
      return { success: false, message: res.message || 'Kayıt başarısız.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Kayıt işlemi başarısız.' };
    }
  };

  const logout = () => {
    localStorage.removeItem('isbey_token');
    setUser(null);
    setActiveTenant(null);
    setAllowedTenants([]);
  };

  const switchCompany = async (tenantId: string): Promise<boolean> => {
    try {
      const res = await api.switchCompany(tenantId);
      if (res.success && res.token) {
        localStorage.setItem('isbey_token', res.token);
        setUser(res.user);
        setActiveTenant(res.activeTenant);
        await refreshProfile();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Role-Based Access Control logic (mevcut — korundu)
  const can = (action: 'view' | 'add' | 'edit' | 'delete' | 'print' | 'export', module: string): boolean => {
    if (!user) return false;
    const roles = user.effectiveRoles || [user.role];
    return roles.some(role => _hasPermission(role, action, module));
  };

  // FAZ 17: Merkezi modül erişim kontrolü
  const canAccessModule = (moduleId: string): boolean => {
    if (!user) return false;
    // UserPermission[] → modül adı string'lerine çevir (module.canView kontrolü)
    return canAccessMembershipModule(user.effectiveRoles || [user.role], user.permissionCodes, moduleId);
  };

  // FAZ 17: Aktif çalışma alanı
  const userWorkspace: UserWorkspace = user ? getUserWorkspace(user.role) : 'ERP';

  // FAZ 17: Login sonrası başlangıç view
  const getInitialView = (): AppView => {
    if (!user) return 'dashboard';
    return getInitialViewForRole(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeTenant,
        allowedTenants,
        isAuthenticated: !!user,
        isLoading,
        showOnboardingWizard,
        setShowOnboardingWizard,
        login,
        register,
        logout,
        switchCompany,
        refreshProfile,
        can,
        canAccessModule,
        userWorkspace,
        getInitialView,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
