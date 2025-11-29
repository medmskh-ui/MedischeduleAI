
import React, { useState } from 'react';
import { User } from '../types';
import { Activity, Lock, User as UserIcon, ArrowRight } from 'lucide-react';

interface Props {
  onLogin: (user: User) => void;
}

const Login: React.FC<Props> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Simple mock authentication
    if (username === 'admin' && password === 'password') {
      onLogin({ username: 'Admin User', role: 'admin' });
    } else if (username === 'user' && password === 'password') {
      onLogin({ username: 'General User', role: 'user' });
    } else {
      setError('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sarabun">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100">
        <div className="bg-medical-600 p-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 backdrop-blur-sm">
            <Activity size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white">MediSchedule AI</h1>
          <p className="text-medical-100 text-sm mt-1">ระบบจัดตารางเวรแพทย์อัจฉริยะ</p>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อผู้ใช้งาน</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-400 outline-none transition-all"
                  placeholder="Username"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">รหัสผ่าน</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-400 outline-none transition-all"
                  placeholder="Password"
                />
              </div>
            </div>

            {error && (
              <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg border border-red-100 text-center">
                {error}
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-medical-600 text-white py-3 rounded-lg font-semibold hover:bg-medical-700 transition flex items-center justify-center gap-2 group"
            >
              เข้าสู่ระบบ <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-xs text-center text-gray-500 font-medium mb-3">บัญชีสำหรับทดสอบระบบ</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-50 p-2 rounded border border-gray-200 text-center">
                <div className="font-bold text-medical-700">Admin</div>
                <div className="text-gray-500">user: admin</div>
                <div className="text-gray-500">pass: password</div>
              </div>
              <div className="bg-gray-50 p-2 rounded border border-gray-200 text-center">
                <div className="font-bold text-blue-700">User</div>
                <div className="text-gray-500">user: user</div>
                <div className="text-gray-500">pass: password</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
