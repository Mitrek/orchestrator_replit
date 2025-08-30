import { LoginRequest, RegisterRequest, User } from "@shared/schema";

interface AuthResponse {
  user: User;
  token: string;
}

const API_BASE = "";

export async function login(credentials: LoginRequest): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Login failed");
  }

  const data = await response.json();
  
  // Store token in localStorage
  localStorage.setItem("auth_token", data.token);
  
  return data;
}

export async function register(userData: RegisterRequest): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(userData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Registration failed");
  }

  const data = await response.json();
  
  // Store token in localStorage
  localStorage.setItem("auth_token", data.token);
  
  return data;
}

export function logout(): void {
  localStorage.removeItem("auth_token");
}

export function getAuthToken(): string | null {
  return localStorage.getItem("auth_token");
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

export async function getCurrentUser(): Promise<User | null> {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(`${API_BASE}/api/user/profile`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      logout();
      return null;
    }

    return await response.json();
  } catch (error) {
    logout();
    return null;
  }
}
