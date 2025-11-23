export interface Registration {
  id: string;
  type: 'individual' | 'group';
  event: string;
  classVal: string;
  names: string[];
  timestamp?: any;
}

export interface RegistrationFormData {
  id: string | null;
  type: 'individual' | 'group';
  event: string;
  classVal: string;
  names: string[];
}

export interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

// Declare global variables injected by the environment
declare global {
  interface Window {
    jspdf: any;
    jsPDF: any;
    __app_id?: string;
    __firebase_config?: string;
    __initial_auth_token?: string;
  }
  const __app_id: string | undefined;
  const __firebase_config: string | undefined;
  const __initial_auth_token: string | undefined;
}