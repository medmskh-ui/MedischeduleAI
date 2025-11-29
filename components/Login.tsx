
import React, { useState } from 'react';
import { User } from '../types';
import { Activity, Lock, User as UserIcon, ArrowRight, Loader2, UserPlus, LogIn, IdCard } from 'lucide-react';
import { dataService } from '../services/dataService';

interface Props {
  onLogin: (user: User) => void;
}

const Login: React.FC<Props> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Register State
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      const user = await dataService.login(username, password);
      onLogin(user);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (regPassword !== regConfirmPassword) {
      setError('รหัสผ่านยืนยันไม่ตรงกัน');
      setIsLoading(false);
      return;
    }

    try {
      await dataService.register(regUsername, regPassword, regName);
      setSuccessMsg('สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ');
      setIsRegistering(false);
      // Auto-fill login username
      setUsername(regUsername);
      setPassword(''); 
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'ไม่สามารถสมัครสมาชิกได้');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sarabun">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100">
        <div className="bg-medical-600 p-8 text-center relative overflow-hidden">
           {/* Decorative circles */}
           <div className="absolute top-0 left-0 w-32 h-32 bg-white/10 rounded-full -translate-x-10 -translate-y-10"></div>
           <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/10 rounded-full translate-x-8 translate-y-8"></div>
           
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 backdrop-blur-sm relative z-10">
            <Activity size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white relative z-10">MediSchedule AI</h1>
          <p className="text-medical-100 text-sm mt-1 relative z-10">
            {isRegistering ? 'สมัครสมาชิกใหม่' : 'ระบบจัดตารางเวรแพทย์อัจฉริยะ'}
          </p>
        </div>
        
        <div className="p-8">
          
          {/* Error / Success Messages */}
          {error && (
            <div className="mb-4 text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-100 text-center animate-in fade-in slide-in-from-top-2">
              {error}
            </div>
          )}
          
          {successMsg && (
            <div className="mb-4 text-green-600 text-sm bg-green-50 p-3 rounded-lg border border-green-100 text-center animate-in fade-in slide-in-from-top-2">
              {successMsg}
            </div>
          )}

          {isRegistering ? (
            // --- REGISTER FORM ---
            <form onSubmit={handleRegister} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อ-นามสกุล (สำหรับแสดงผล)</label>
                <div className="relative">
                  <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-400 outline-none transition-all"
                    placeholder="เช่น นพ.สมชาย ใจดี"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อผู้ใช้งาน (Username)</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="text"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-400 outline-none transition-all"
                    placeholder="Username"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">รหัสผ่าน</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-400 outline-none transition-all"
                    placeholder="Password"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ยืนยันรหัสผ่าน</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="password"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-400 outline-none transition-all"
                    placeholder="Confirm Password"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={isLoading}
                className="w-full bg-medical-600 text-white py-3 rounded-lg font-semibold hover:bg-medical-700 transition flex items-center justify-center gap-2 group disabled:opacity-70 mt-2"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                สมัครสมาชิก
              </button>
            </form>
          ) : (
            // --- LOGIN FORM ---
            <form onSubmit={handleLogin} className="space-y-5 animate-in fade-in slide-in-from-left-4 duration-300">
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
                    disabled={isLoading}
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
                    disabled={isLoading}
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={isLoading}
                className="w-full bg-medical-600 text-white py-3 rounded-lg font-semibold hover:bg-medical-700 transition flex items-center justify-center gap-2 group disabled:opacity-70"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> กำลังตรวจสอบ...
                  </>
                ) : (
                  <>
                    <LogIn size={18} /> เข้าสู่ระบบ
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-gray-100 text-center text-sm">
            <span className="text-gray-600">
              {isRegistering ? 'มีบัญชีอยู่แล้ว? ' : 'ยังไม่มีบัญชี? '}
            </span>
            <button
               type="button"
               onClick={() => {
                 setIsRegistering(!isRegistering);
                 setError('');
                 setSuccessMsg('');
               }}
               className="text-medical-600 font-bold hover:text-medical-700 hover:underline transition ml-1"
            >
              {isRegistering ? 'เข้าสู่ระบบ' : 'สมัครบัญชีใหม่'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <div className="mt-8 text-center text-gray-400 text-xs font-medium">
         © 2025 MediSchedule AI by Karpark  l  Version 1.0.0
      </div>
    </div>
  );
};

export default Login;
