export type AdminProfile = {
  displayName: string;
  title?: string;
  department?: string;
  email?: string;
  phone?: string;
  bio?: string;
  linkedIn?: string;
  photoUrl?: string;
};

const STORAGE_KEY = 'netchess_admin_profile';

const DEFAULT: AdminProfile = { displayName: 'Yönetici' };

export function loadAdminProfile(): AdminProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const data = JSON.parse(raw) as AdminProfile;
    return {
      displayName: data.displayName?.trim() || DEFAULT.displayName,
      title: data.title?.trim() || undefined,
      department: data.department?.trim() || undefined,
      email: data.email?.trim() || undefined,
      phone: data.phone?.trim() || undefined,
      bio: data.bio?.trim() || undefined,
      linkedIn: data.linkedIn?.trim() || undefined,
      photoUrl: data.photoUrl?.trim() || undefined,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveAdminProfile(profile: AdminProfile): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      displayName: profile.displayName.trim() || DEFAULT.displayName,
      title: profile.title?.trim() || undefined,
      department: profile.department?.trim() || undefined,
      email: profile.email?.trim() || undefined,
      phone: profile.phone?.trim() || undefined,
      bio: profile.bio?.trim() || undefined,
      linkedIn: profile.linkedIn?.trim() || undefined,
      photoUrl: profile.photoUrl?.trim() || undefined,
    }),
  );
}
