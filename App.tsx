import React, { useState, useEffect, useRef } from 'react';
import { Doctor, DailySchedule, ScheduleConfig, User } from './types';
import DoctorManager from './components/DoctorManager';
import ConfigPanel from './components/ConfigPanel';
import ScheduleTable from './components/ScheduleTable';
import Login from './components/Login';
import { generateScheduleWithGemini } from './services/geminiService';
import { dataService } from './services/dataService';
import { exportToPDF, exportToDocx } from './utils/exportUtils';
import { getDaysInMonth, format } from 'date-fns';
import { Sparkles, FileText, Activity, CalendarDays, Users, LayoutDashboard, ChevronLeft, ChevronRight, LogOut, CheckCircle, Loader2 } from 'lucide-react';
import th from 'date-fns/locale/th';

type View = 'schedule' | 'doctors' | 'holidays';
type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

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
  
  // Saving State
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  
  // Track if initial data load is complete
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  
  // Track if schedule has been modified by user (to prevent auto-save on load)
  const scheduleDirtyRef = useRef(false);
  // Ref for debounce timer
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Load Data on Mount (Doctors & Config ONLY)
  useEffect(() => {
    const loadData = async () => {
      try {
        const [loadedDoctors, loadedConfig] = await Promise.all([
          dataService.getDoctors(),
          dataService.getConfig()
        ]);

        if (loadedDoctors.length > 0) setDoctors(loadedDoctors);
        if (loadedConfig) setConfig(loadedConfig);
        
        setIsDataLoaded(true);
      } catch (error) {
        console.error("Failed to load initial data:", error);
        setIsDataLoaded(true); // Proceed anyway
      }
    };
    loadData();
  }, []);

  // 2. Auto-Save Effects

  // Doctors - Save immediately on change (usually infrequent)
  useEffect(() => {
    if (isDataLoaded) {
      dataService.saveDoctors(doctors);
    }
  }, [doctors, isDataLoaded]);

  // Config - Save immediately on change
  useEffect(() => {
    if (isDataLoaded) {
      dataService.saveConfig(config);
    }
  }, [config, isDataLoaded]);

  // Helper function to save schedule to DB
  const saveScheduleToDb = async (currentSchedule: DailySchedule[]) => {
    setIsSaving(true);
    setSaveStatus('saving');
    try {
      await dataService.saveSchedule(currentSchedule);
      setSaveStatus('saved');
      // Mark as clean ONLY if we successfully saved
      // Note: In a race condition where user edits WHILE saving, 
      // the dirty ref would be set to true again by the edit handler, 
      // so we should be careful. But for the blocking navigation case, this is safe.
      return true;
    } catch (error) {
      console.error("Save failed:", error);
      setSaveStatus('error');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Schedule Auto-Save with DEBOUNCE
  useEffect(() => {
    if (isDataLoaded && schedule.length > 0 && scheduleDirtyRef.current) {
      setSaveStatus('unsaved');

      // Clear any existing timer
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set a new timer to save after 1 second of inactivity
      saveTimeoutRef.current = setTimeout(async () => {
        const success = await saveScheduleToDb(schedule);
        if (success) {
           scheduleDirtyRef.current = false;
        }
      }, 1000);
    }

    // Cleanup function to clear timer if component unmounts or schedule changes again
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [schedule, isDataLoaded]);

  // 3. Handle Month/Year Change OR Config Change
  useEffect(() => {
    if (!isDataLoaded) return;
    
    let isActive = true;

    const syncScheduleWithDb = async () => {
      try {
        // Always fetch the latest full schedule from DB to ensure we don't lose data
        const dbSchedule = await dataService.getSchedule();
        
        if (!isActive) return;

        const daysInMonth = getDaysInMonth(new Date(config.year, config.month));
        const newMonthSchedule: DailySchedule[] = [];

        for (let i = 1; i <= daysInMonth; i++) {
          const date = new Date(config.year, config.month, i);
          const dateStr = format(date, 'yyyy-MM-dd');
          const dayOfWeek = date.getDay();
          const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
          const customHoliday = config.customHolidays.find(h => h.date === dateStr);
          const isHoliday = isWeekendDay || !!customHoliday;

          // Try to find this date in the fetched DB data
          const existingDay = dbSchedule.find(s => s.date.split('T')[0] === dateStr);

          if (existingDay) {
            newMonthSchedule.push({
              ...existingDay,
              isHoliday: isHoliday,
              holidayName: customHoliday?.name,
              shifts: existingDay.shifts || {
                morning: isHoliday ? { icu: null, general: null } : undefined,
                afternoon: { icu: null, general: null },
                night: { icu: null, general: null }
              }
            });
          } else {
            newMonthSchedule.push({
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
        }
        
        setSchedule(newMonthSchedule);
        scheduleDirtyRef.current = false;
        setSaveStatus('saved');
        
      } catch (error) {
        console.error("Error syncing schedule:", error);
      }
    };

    syncScheduleWithDb();
    
    return () => { isActive = false; };

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
    
    scheduleDirtyRef.current = true;
    setSaveStatus('unsaved');
  };

  const handleGenerate = async () => {
    if (user?.role !== 'admin') return;

    if (doctors.filter(d => d.active).length < 2) {
      alert("กรุณาเพิ่มรายชื่อแพทย์ (Active) อย่างน้อย 2 ท่าน");
      return;
    }

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
      scheduleDirtyRef.current = true;
      setSaveStatus('unsaved');
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

  const cycleMonth = async (direction: 'prev' | 'next') => {
    if (isSaving) return; // Prevent clicking while saving

    // GUARD: If dirty, force save and WAIT before changing month
    if (scheduleDirtyRef.current) {
        // Cancel any pending debounced save
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        
        // Block and Save
        const success = await saveScheduleToDb(schedule);
        if (success) {
            scheduleDirtyRef.current = false;
        } else {
            alert("กำลังบันทึกข้อมูล กรุณารอสักครู่แล้วลองใหม่");
            return;
        }
    }

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
  const isViewer = user.role === 'viewer';

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
             {/* View Switcher (Desktop) */}
             <nav className="hidden md:flex bg-gray-100 p-1 rounded-lg">
                <button 
                  onClick={() => setCurrentView('schedule')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${currentView === 'schedule' ? 'bg-white text-medical-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  ตารางเวร
                </button>
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
                 <button 
                   onClick={() => cycleMonth('prev')} 
                   disabled={isSaving}
                   className="p-2 hover:bg-gray-100 rounded-full text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                 >
                   <ChevronLeft size={20}/>
                 </button>
                 
                 <div className="flex flex-col items-center">
                    <h2 className="text-lg font-bold text-gray-800">
                        ตารางเวรแพทย์อายุรกรรม {monthName} {buddhistYear}
                    </h2>
                    {/* Status Indicator */}
                    <div className="flex items-center gap-1.5 h-4">
                       {saveStatus === 'saving' && (
                         <>
                           <Loader2 size={10} className="text-orange-500 animate-spin" />
                           <span className="text-[10px] text-orange-500 font-medium">กำลังบันทึก...</span>
                         </>
                       )}
                       {saveStatus === 'saved' && (
                         <>
                           <CheckCircle size={10} className="text-green-500" />
                           <span className="text-[10px] text-green-500 font-medium">บันทึกแล้ว</span>
                         </>
                       )}
                       {saveStatus === 'unsaved' && (
                           <span className="text-[10px] text-gray-400 font-medium">รอการบันทึก...</span>
                       )}
                       {saveStatus === 'error' && (
                           <span className="text-[10px] text-red-500 font-medium">บันทึกล้มเหลว</span>
                       )}
                    </div>
                 </div>

                 <button 
                   onClick={() => cycleMonth('next')} 
                   disabled={isSaving}
                   className="p-2 hover:bg-gray-100 rounded-full text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                 >
                   <ChevronRight size={20}/>
                 </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-center md:justify-end">
                {isAdmin && (
                  <>
                    <button
                      onClick={handleGenerate}
                      disabled={isGenerating || isSaving}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-medical-600 to-medical-500 text-white rounded-lg hover:from-medical-700 hover:to-medical-600 transition shadow-sm disabled:opacity-70 text-sm font-semibold"
                    >
                      <Sparkles size={16} className={isGenerating ? "animate-spin" : ""} />
                      {isGenerating ? 'กำลังสร้าง...' : 'สร้างตาราง (AI)'}
                    </button>
                    <div className="h-8 w-px bg-gray-300 hidden md:block mx-2"></div>
                  </>
                )}
                
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

      {/* Mobile Navigation Bar */}
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