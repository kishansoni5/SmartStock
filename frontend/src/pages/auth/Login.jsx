import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'ADMIN') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/customer', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setFieldErrors({});

    // Client-side validation
    if (!email.trim()) {
      setFieldErrors((prev) => ({ ...prev, email: 'Email address is required' }));
      return;
    }
    if (!password) {
      setFieldErrors((prev) => ({ ...prev, password: 'Password is required' }));
      return;
    }

    setIsSubmitting(true);

    try {
      const loggedInUser = await login({ email, password });

      // Determine redirect path
      const originPath = location.state?.from?.pathname;
      if (originPath && originPath !== '/login' && originPath !== '/register') {
        // If coming from an attempted navigation, honor role restrictions
        if (originPath.startsWith('/admin') && loggedInUser.role !== 'ADMIN') {
          navigate('/customer', { replace: true });
        } else {
          navigate(originPath, { replace: true });
        }
      } else {
        // Role-based redirect
        if (loggedInUser.role === 'ADMIN') {
          navigate('/admin', { replace: true });
        } else {
          navigate('/customer', { replace: true });
        }
      }
    } catch (err) {
      // err is unwrapped ApiResponse from axiosInstance interceptor
      if (err?.data && typeof err.data === 'object') {
        setFieldErrors(err.data);
      }
      setErrorMessage(
        err?.message || 'Authentication failed. Please verify your credentials.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8 sm:p-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 text-3xl mb-3 shadow-xs">
            📦
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sign in to SmartStock</h2>
          <p className="text-sm text-slate-500 mt-1.5">
            Enterprise Inventory & Event-Driven Order System
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
            <span className="text-sm font-bold">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold">{errorMessage}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <Input
            id="email"
            label="Email Address"
            type="email"
            placeholder="admin@smartstock.local"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
            }}
            error={fieldErrors.email}
            required
            autoComplete="email"
          />

          <Input
            id="password"
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
            }}
            error={fieldErrors.password}
            required
            autoComplete="current-password"
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Signing In...
              </span>
            ) : (
              'Sign In'
            )}
          </Button>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500">
            <strong className="text-slate-700 block mb-0.5">Seeded Administrator:</strong>
            <span className="font-mono text-slate-600">admin@smartstock.local</span> /{' '}
            <span className="font-mono text-slate-600">Kishan@123</span>
          </div>

          <div className="text-center text-xs text-slate-500 pt-2 border-t border-slate-100">
            Don't have an account?{' '}
            <Link to="/register" className="text-indigo-600 font-semibold hover:underline">
              Create a customer account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
