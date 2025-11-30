
import React, { useState } from 'react';
import { ScheduleConfig } from '../types';
import { Calendar, Info, X, Trash2, Save } from 'lucide-react';
import { getDaysInMonth, format } from 'date-fns';
import th from 'date-fns/locale/th';

interface Props {
  config: ScheduleConfig;
  setConfig: React.Dispatch<React.SetStateAction<ScheduleConfig>>;
  isAdmin: boolean;
}

const ConfigPanel: React.FC<Props> = ({ config, setConfig, isAdmin }) => {
  const currentYear = new Date().getFullYear();
  // Generate range: 5 years before and 5 years after current year (11 years total)
  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  // Modal State
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [holidayName, setHolidayName] = useState('');

  const handleDayClick = (day: number) => {
    // Only Admin can edit holidays
    if (!isAdmin) return;

    const date = new Date(config.year, config.month, day);
    const dateStr = format(date, 'yyyy-MM-dd');
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    // Do not allow toggling weekends off (they are intrinsically holidays in this logic)
    if (isWeekend) return;
    
    const existingHoliday = config.customHolidays.find(h => h.date === dateStr);
    
    setSelectedDate(date);
    setHolidayName(existingHoliday ? existingHoliday.name : '');
  };

  const saveHoliday = () => {
    if (!selectedDate) return;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    // Remove existing if any (to update)
    const filtered = config.customHolidays.filter(h => h.date !== dateStr);
    
    // Add new
    const newHolidays = [...filtered, { date: dateStr, name: holidayName }];
    
    // Sort
    newHolidays.sort((a, b) => a.date.localeCompare(b.date));

    setConfig({ ...config, customHolidays: newHolidays });
    closeModal();
  };

  const deleteHoliday = () => {
    if (!selectedDate) return;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const newHolidays = config.customHolidays.filter(h => h.date !== dateStr);
    setConfig({ ...config, customHolidays: newHolidays });
    closeModal();
  };

  const closeModal = () => {
    setSelectedDate(null);
    setHolidayName('');
  };

  const removeHolidayDirectly = (dateStr: string) => {
    const newHolidays = config.customHolidays.filter(h => h.date !== dateStr);
    setConfig({ ...config, customHolidays: newHolidays });
  };

  const daysInMonth = getDaysInMonth(new Date(config.year, config.month));
  
  // Calculate padding days for the calendar grid start
  const firstDayOfMonth = new Date(config.year, config.month, 1).getDay(); // 0 (Sun) - 6 (Sat)
  const emptySlots = Array.from({ length: firstDayOfMonth }, (_, i) => i);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Filter holidays for the currently selected month/year
  const displayedHolidays = config.customHolidays.filter(h => {
     const [y, m] = h.date.split('-').map(Number);
     return y === config.year && (m - 1) === config.month;
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gray-50/50">
           <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Calendar className="text-medical-600" /> {isAdmin ? 'ตั้งค่าวันเดือนปี และวันหยุด' : 'ปฏิทินวันหยุด'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin 
              ? 'เลือกเดือนที่ต้องการจัดตาราง และกำหนดวันหยุดราชการเพิ่มเติม' 
              : 'ดูปฏิทินวันหยุดประจำเดือน'}
          </p>
        </div>

        <div className="p-6">
          {/* Month/Year Selection - Available for ALL to navigate */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-1">เดือน</label>
              <select
                value={config.month}
                onChange={(e) => setConfig({ ...config, month: parseInt(e.target.value) })}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-400 outline-none bg-white cursor-pointer"
              >
                {months.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-1">ปี (พ.ศ.)</label>
              <select
                value={config.year}
                onChange={(e) => setConfig({ ...config, year: parseInt(e.target.value) })}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-400 outline-none bg-white cursor-pointer"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y + 543}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mb-4 text-sm justify-end">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-100 border border-gray-200"></div>
              <span className="text-gray-600">วันธรรมดา</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-orange-100 border border-orange-200 text-orange-800 flex items-center justify-center font-bold text-[10px]">S</div>
              <span className="text-gray-600">เสาร์-อาทิตย์</span>
            </div>
             <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-500 border border-red-600 shadow-sm"></div>
              <span className="text-gray-600">วันหยุดนักขัตฤกษ์</span>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
             <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
               {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d, i) => (
                 <div key={i} className={`py-3 text-center text-sm font-bold ${i === 0 || i === 6 ? 'text-orange-600' : 'text-gray-600'}`}>
                   {d}
                 </div>
               ))}
             </div>
             <div className="grid grid-cols-7 bg-white">
                {emptySlots.map(s => <div key={`empty-${s}`} className="h-28 border-b border-r border-gray-100 bg-gray-50/30"></div>)}
                {daysArray.map(day => {
                  const date = new Date(config.year, config.month, day);
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const holiday = config.customHolidays.find(h => h.date === dateStr);
                  const isCustomHoliday = !!holiday;
                  
                  return (
                    <button
                      key={day}
                      onClick={() => handleDayClick(day)}
                      disabled={isWeekend || !isAdmin} // Disable if not admin or if weekend
                      className={`
                        h-28 p-2 border-b border-r border-gray-100 text-left relative transition-all group flex flex-col justify-between
                        ${isAdmin ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}
                        ${isWeekend ? 'bg-orange-50/50 cursor-default' : ''}
                        ${isCustomHoliday ? 'bg-red-50' : ''}
                        ${isCustomHoliday && isAdmin ? 'hover:bg-red-100' : ''}
                      `}
                    >
                      <span className={`
                        text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                        ${isWeekend ? 'text-orange-600' : 'text-gray-700'}
                        ${isCustomHoliday ? 'bg-red-500 text-white shadow-sm' : ''}
                        ${format(new Date(), 'yyyy-MM-dd') === dateStr ? 'ring-2 ring-medical-400' : ''}
                      `}>
                        {day}
                      </span>
                      
                      {isCustomHoliday && (
                        <div className="w-full mt-1">
                          <span className="block text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded-md truncate border border-red-200">
                             {holiday.name || "วันหยุด"}
                          </span>
                        </div>
                      )}

                      {!isWeekend && !isCustomHoliday && isAdmin && (
                        <span className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 text-xs text-gray-400 font-medium">
                          ตั้งวันหยุด
                        </span>
                      )}
                      
                      {isWeekend && (
                         <span className="absolute bottom-2 right-2 text-[10px] text-orange-300 font-medium uppercase tracking-wider">Weekend</span>
                      )}
                    </button>
                  );
                })}
             </div>
          </div>
          
          {isAdmin && (
            <div className="mt-4 flex items-start gap-2 text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
               <Info size={16} className="mt-0.5 text-medical-600 flex-shrink-0" />
               <p>คลิกที่วันธรรมดาเพื่อกำหนดให้เป็น "วันหยุดนักขัตฤกษ์" (มีเวรเช้า)</p>
            </div>
          )}

          {/* List of custom holidays (Filtered by current month) */}
          {displayedHolidays.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-gray-700 mb-3">รายการวันหยุดที่กำหนดเอง (เดือนนี้)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {displayedHolidays.map((h, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full bg-red-500"></div>
                       <span className="text-sm font-medium text-gray-700">{format(new Date(h.date), 'd MMM yyyy', { locale: th })}</span>
                       <span className="text-sm text-gray-500 border-l border-gray-200 pl-2 ml-2">{h.name || '-'}</span>
                    </div>
                    {isAdmin && (
                      <button 
                        onClick={() => removeHolidayDirectly(h.date)}
                        className="text-gray-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Holiday Edit Modal (Admin Only) */}
      {selectedDate && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-bold text-gray-800">
                {format(selectedDate, 'd MMMM yyyy', { locale: th })}
              </h3>
              <button 
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 p-1 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                ชื่อวันหยุด <span className="text-gray-400 font-normal">(ไม่บังคับ)</span>
              </label>
              <input
                type="text"
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                placeholder="เช่น วันพ่อแห่งชาติ, วันหยุดพิเศษ"
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-400 outline-none"
                autoFocus
              />
              
              <div className="mt-6 flex gap-2 justify-end">
                {config.customHolidays.find(h => h.date === format(selectedDate, 'yyyy-MM-dd')) && (
                  <button
                    onClick={deleteHoliday}
                    className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition text-sm font-medium flex items-center gap-1"
                  >
                    <Trash2 size={16} /> ลบวันหยุด
                  </button>
                )}
                <button
                  onClick={saveHoliday}
                  className="px-4 py-2 bg-medical-600 text-white rounded-lg hover:bg-medical-700 transition text-sm font-medium flex items-center gap-1"
                >
                  <Save size={16} /> บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ConfigPanel;
