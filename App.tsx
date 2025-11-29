
import React, { useState, useEffect, useRef } from 'react';
import { Doctor, DailySchedule, ScheduleConfig, User } from './types';
import DoctorManager from './components/DoctorManager';
import ConfigPanel from './components/ConfigPanel';
import ScheduleTable from './components/ScheduleTable';
import Login from './components/Login';
import { generateScheduleWithGemini } from './services/geminiService';
import { dataService } from './services/dataService';
import { exportToPDF, exportToDocx } from './utils/exportUtils';
import { getDaysInMonth, isWeekend, format } from 'date-fns';
import { Sparkles, FileText, Download, Activity, CalendarDays, Users, LayoutDashboard, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import th from 'date-fns/locale/th';

type View = 'schedule' | 'doctors' | 'holidays';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('schedule');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [config, setConfig] = useState<ScheduleConfig>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    customHolidays: []
  });
  const [schedule, setSchedule] = useState<DailySchedule[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Track if initial data load is complete to prevent overwriting storage with empty states
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  
  // Ref to prevent cyclic dependency on schedule regeneration
  const isFirstRender = useRef(true);

  // 1. Load Data on Mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [loadedDoctors, loadedSchedule, loadedConfig] = await Promise.all([
          dataService.getDoctors(),
          dataService.getSchedule(),
          dataService.getConfig()
        ]);

        if (loadedDoctors.length > 0) setDoctors(loadedDoctors);
        if (loadedSchedule.length > 0) setSchedule(loadedSchedule);
        if (loadedConfig) setConfig(loadedConfig);
        
        setIsDataLoaded(true);
      } catch (error) {
        console.error("Failed to load data:", error);
        setIsDataLoaded(true); // Proceed anyway
      }
    };
    loadData();
  }, []);

  // 2. Auto-Save Effects (Run only after data is loaded)
  useEffect(() => {
    if (isDataLoaded) {
      dataService.saveDoctors(doctors);
    }
  }, [doctors, isDataLoaded]);

  useEffect(() => {
    if (isDataLoaded) {
      dataService.saveSchedule(schedule);
    }
  }, [schedule, isDataLoaded]);

  useEffect(() => {
    if (isDataLoaded) {
      dataService.saveConfig(config);
    }
  }, [config, isDataLoaded]);

  // 3. Initialize schedule structure when config changes (Month/Year change)
  useEffect(() => {
    if (!isDataLoaded) return;
    
    const daysInMonth = getDaysInMonth(new Date(config.year, config.month));
    const belongsToCurrentMonth = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.getFullYear() === config.year && d.getMonth() === config.month;
    };

    const shouldRebuild = schedule.length === 0 || !belongsToCurrentMonth(schedule[0].date);

    if (shouldRebuild) {
      const newSchedule: DailySchedule[] = [];
      for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(config.year, config.month, i);
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayOfWeek = date.getDay();
        const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
        const customHoliday = config.customHolidays.find(h => h.date === dateStr);
        const isHoliday = isWeekendDay || !!customHoliday;

        newSchedule.push({
          date: dateStr,
          isHoliday: isHoliday,
          holidayName: customHoliday?.name,
          shifts: {
            morning: isHoliday ? { icu: null, general: null } : undefined,
            afternoon: { icu: null, general: null },
            night: { icu: null, general: null }
          }
        });
      }
      setSchedule(newSchedule);
    } else {
      setSchedule(prev => prev.map(day => {
        const dateObj = new Date(day.date);
        const dayOfWeek = dateObj.getDay();
        const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
        const customHoliday = config.customHolidays.find(h => h.date === day.date);
        const isHoliday = isWeekendDay || !!customHoliday;
        
        if (day.isHoliday !== isHoliday || day.holidayName !== customHoliday?.name) {
           return {
             ...day,
             isHoliday,
             holidayName: customHoliday?.name,
             shifts: {
               ...day.shifts,
               morning: isHoliday && !day.shifts.morning ? { icu: null, general: null } : day.shifts.morning
             }
           };
        }
        return day;
      }));
    }

  }, [config.year, config.month, config.customHolidays, isDataLoaded]);

  const updateSchedule = (date: string, shift: 'morning' | 'afternoon' | 'night', type: 'icu' | 'general', doctorId: string) => {
    if (user?.role !== 'admin') return;

    setSchedule(prev => prev.map(day => {
      if (day.date === date) {
        const newShifts = { ...day.shifts };
        
        if (shift === 'morning' && newShifts.morning) {
          newShifts.morning = { ...newShifts.morning, [type]: doctorId };
          
          if (type === 'general') {
             newShifts.afternoon = { ...newShifts.afternoon, icu: doctorId };
             newShifts.night = { ...newShifts.night, icu: doctorId };
          }
          else if (type === 'icu') {
             newShifts.afternoon = { ...newShifts.afternoon, general: doctorId };
             newShifts.night = { ...newShifts.night, general: doctorId };
          }

        } else if (shift === 'afternoon') {
          newShifts.afternoon = { ...newShifts.afternoon, [type]: doctorId };
          newShifts.night = { ...newShifts.night, [type]: doctorId };
        } else {
          newShifts.night = { ...newShifts.night, [type]: doctorId };
        }

        return { ...day, shifts: newShifts };
      }
      return day;
    }));
  };

  const handleGenerate = async () => {
    if (user?.role !== 'admin') return;

    if (doctors.filter(d => d.active).length < 2) {
      alert("กรุณาเพิ่มรายชื่อแพทย์ (Active) อย่างน้อย 2 ท่าน");
      return;
    }

    // Removed client-side API Key check. The server now handles the key.

    setIsGenerating(true);
    try {
      const generated = await generateScheduleWithGemini(doctors, config);
      setSchedule(prev => prev.map(day => {
        const genDay = generated.find(g => g.date === day.date);
        if (!genDay) return day;
        return {
          ...day,
          shifts: genDay.shifts
        };
      }));
    } catch (error: any) {
      console.error(error);
      alert("เกิดข้อผิดพลาดในการสร้างตาราง: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      await exportToPDF(schedule, doctors, config);
    } catch (error) {
      console.error("PDF Export failed:", error);
      alert("เกิดข้อผิดพลาดในการ Export PDF");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportDocx = async () => {
    setIsExporting(true);
    try {
      await exportToDocx(schedule, doctors, config);
    } catch (error) {
      console.error("Docx Export failed:", error);
      alert("เกิดข้อผิดพลาดในการ Export Word");
    } finally {
      setIsExporting(false);
    }
  };

  const cycleMonth = (direction: 'prev' | 'next') => {
    let newMonth = config.month + (direction === 'next' ? 1 : -1);
    let newYear = config.year;

    if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    } else if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    }
    setConfig({ ...config, month: newMonth, year: newYear });
  };

  const handleLogin = (u: User) => {
    setUser(u);
    setCurrentView('schedule');
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const monthName = format(new Date(config.year, config.month), 'MMMM', { locale: th });
  const buddhistYear = config.year + 543;
  const isAdmin = user.role === 'admin';
  const isViewer = user.role === 'viewer'; // Check viewer role

  if (!isDataLoaded) {
    return <div className="min-h-screen flex items-center justify-center text-medical-600 font-bold">กำลังโหลดข้อมูล...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sarabun text-slate-900 pb-20 md:pb-0">
      
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
           <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-medical-600 rounded-lg flex items-center justify-center text-white">
               <Activity size={20} />
             </div>
             <div>
               <h1 className="text-xl font-bold text-gray-800 leading-tight">MediSchedule AI</h1>
               <p className="text-[10px] text-gray-500 font-medium">ระบบจัดตารางเวรแพทย์อัจฉริยะ</p>
             </div>
           </div>

           <div className="flex items-center gap-4">
             {/* View Switcher (Desktop) - HIDE tabs for viewer */}
             <nav className="hidden md:flex bg-gray-100 p-1 rounded-lg">
                <button 
                  onClick={() => setCurrentView('schedule')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${currentView === 'schedule' ? 'bg-white text-medical-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  ตารางเวร
                </button>
                {/* Viewer cannot see Doctors/Holidays tab */}
                {!isViewer && (
                  <>
                    <button 
                      onClick={() => setCurrentView('doctors')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${currentView === 'doctors' ? 'bg-white text-medical-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      รายชื่อแพทย์
                    </button>
                    <button 
                      onClick={() => setCurrentView('holidays')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${currentView === 'holidays' ? 'bg-white text-medical-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      วันหยุด
                    </button>
                  </>
                )}
             </nav>

             <div className="flex items-center gap-2 pl-4 border-l border-gray-200">
               <div className="hidden md:block text-right">
                 {/* Display Name instead of Username */}
                 <div className="text-sm font-bold text-gray-800">{user.name || user.username}</div>
                 <div className="text-[10px] text-gray-500 capitalize">{user.role}</div>
               </div>
               <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition" title="ออกจากระบบ">
                 <LogOut size={20} />
               </button>
             </div>
           </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {currentView === 'schedule' && (
          <div className="space-y-6">
            
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                 <button onClick={() => cycleMonth('prev')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><ChevronLeft size={20}/></button>
                 <h2 className="text-lg font-bold text-gray-800">
                    ตารางเวรแพทย์อายุรกรรม {monthName} {buddhistYear}
                 </h2>
                 <button onClick={() => cycleMonth('next')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><ChevronRight size={20}/></button>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-center md:justify-end">
                {/* Generate AI Button - ADMIN ONLY */}
                {isAdmin && (
                  <>
                    <button
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-medical-600 to-medical-500 text-white rounded-lg hover:from-medical-700 hover:to-medical-600 transition shadow-sm disabled:opacity-70 text-sm font-semibold"
                    >
                      <Sparkles size={16} className={isGenerating ? "animate-spin" : ""} />
                      {isGenerating ? 'กำลังสร้าง...' : 'สร้างตาราง (AI)'}
                    </button>
                    <div className="h-8 w-px bg-gray-300 hidden md:block mx-2"></div>
                  </>
                )}
                
                {/* Export Buttons - EVERYONE */}
                <button
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
                >
                  <FileText size={16} className="text-red-500" /> PDF
                </button>
                <button
                  onClick={handleExportDocx}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
                >
                  <FileText size={16} className="text-blue-600" /> Word
                </button>
              </div>
            </div>

            <ScheduleTable 
              schedule={schedule} 
              doctors={doctors} 
              updateSchedule={updateSchedule} 
              readOnly={!isAdmin}
            />
          </div>
        )}

        {currentView === 'doctors' && !isViewer && (
          <DoctorManager 
            doctors={doctors} 
            setDoctors={setDoctors} 
            config={config}
            isAdmin={isAdmin}
          />
        )}

        {currentView === 'holidays' && !isViewer && (
          <ConfigPanel 
            config={config} 
            setConfig={setConfig} 
            isAdmin={isAdmin}
          />
        )}

      </main>

      {/* Mobile Navigation Bar - HIDE items for viewer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden flex justify-around p-2 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button 
          onClick={() => setCurrentView('schedule')}
          className={`flex flex-col items-center p-2 rounded-lg ${currentView === 'schedule' ? 'text-medical-600' : 'text-gray-400'}`}
        >
          <LayoutDashboard size={20} />
          <span className="text-[10px] mt-1 font-medium">ตารางเวร</span>
        </button>
        {!isViewer && (
          <>
            <button 
                onClick={() => setCurrentView('doctors')}
                className={`flex flex-col items-center p-2 rounded-lg ${currentView === 'doctors' ? 'text-medical-600' : 'text-gray-400'}`}
            >
              <Users size={20} />
              <span className="text-[10px] mt-1 font-medium">แพทย์</span>
            </button>
            <button 
                onClick={() => setCurrentView('holidays')}
                className={`flex flex-col items-center p-2 rounded-lg ${currentView === 'holidays' ? 'text-medical-600' : 'text-gray-400'}`}
            >
              <CalendarDays size={20} />
              <span className="text-[10px] mt-1 font-medium">วันหยุด</span>
            </button>
          </>
        )}
      </div>

    </div>
  );
};

export default App;
