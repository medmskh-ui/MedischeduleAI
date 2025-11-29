
import React from 'react';
import { DailySchedule, Doctor } from '../types';
import { format } from 'date-fns';
import th from 'date-fns/locale/th';

interface Props {
  schedule: DailySchedule[];
  doctors: Doctor[];
  updateSchedule: (date: string, shift: 'morning' | 'afternoon' | 'night', type: 'icu' | 'general', doctorId: string) => void;
  readOnly?: boolean;
}

const ScheduleTable: React.FC<Props> = ({ schedule, doctors, updateSchedule, readOnly = false }) => {
  
  const getDoctorStyle = (id: string | null) => {
    if (!id) return {};
    const doctor = doctors.find(d => d.id === id);
    if (!doctor) return {};
    return {
      backgroundColor: doctor.color || '#e5e7eb',
      color: '#1f2937' // dark gray text
    };
  };

  const DoctorSelect = ({ 
    value, 
    onChange,
    date
  }: { 
    value: string | null, 
    onChange: (val: string) => void,
    date: string
  }) => {
    
    // READ ONLY MODE: Show static div
    if (readOnly) {
       const doc = doctors.find(d => d.id === value);
       if (!doc) return <div className="h-full w-full py-2 bg-gray-50 rounded flex items-center justify-center text-gray-300 text-xs">-</div>;
       
       return (
         <div 
           className="w-full text-sm p-2 rounded font-medium text-center truncate"
           style={{ backgroundColor: doc.color, color: '#1f2937' }}
         >
           {doc.name}
         </div>
       );
    }

    // EDIT MODE: Show Select
    // Show only ACTIVE doctors who are NOT UNAVAILABLE on this specific date
    const availableDoctors = doctors.filter(d => d.active && !d.unavailableDates?.includes(date));
    const style = getDoctorStyle(value);

    return (
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={style}
        className="w-full text-sm p-2 rounded border-transparent hover:border-gray-300 focus:border-medical-500 focus:ring-1 focus:ring-medical-500 outline-none cursor-pointer truncate transition-colors appearance-none text-center font-medium"
      >
        <option value="" style={{ backgroundColor: 'white' }}>-</option>
        {availableDoctors.map(d => (
          <option key={d.id} value={d.id} style={{ backgroundColor: d.color }}>{d.name}</option>
        ))}
        {/* Handle case where currently selected doctor is now inactive or unavailable (show them as disabled option so value isn't lost) */}
        {value && !availableDoctors.find(d => d.id === value) && (
             (() => {
                 const hiddenDoc = doctors.find(d => d.id === value);
                 return hiddenDoc ? <option value={hiddenDoc.id} disabled style={{ backgroundColor: hiddenDoc.color }}>({hiddenDoc.name})</option> : null;
             })()
        )}
      </select>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
      {/* Desktop View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            {/* Main Headers */}
            <tr className="text-white text-sm uppercase tracking-wider">
              <th className="p-3 border-r border-gray-300 sticky left-0 bg-gray-800 z-20 w-32 border-b">วันที่</th>
              
              {/* General Ward Header - Custom Color #7F95D1 */}
              <th className="p-3 text-center border-r border-blue-200 border-b" style={{ backgroundColor: '#7F95D1' }} colSpan={3}>
                สามัญ / นอกแผนก / Stroke Fast Tract
              </th>
              
              {/* ICU Ward Header - Custom Color #F0725C */}
              <th className="p-3 text-center border-b" style={{ backgroundColor: '#F0725C' }} colSpan={3}>
                ICU / CCU STEMI Fast Tract
              </th>
            </tr>
            
            {/* Sub Headers (Time Slots) */}
            <tr className="text-xs font-semibold text-gray-700 bg-gray-100">
              <th className="p-2 border-r border-gray-300 sticky left-0 bg-gray-100 z-20 shadow-sm text-center">เวลา</th>
              
              {/* General Sub-columns */}
              <th className="p-2 border-r border-gray-200 text-center w-[13%] bg-blue-50">08:30 - 16:30</th>
              <th className="p-2 border-r border-gray-200 text-center w-[13%] bg-blue-50">16:30 - 00:30</th>
              <th className="p-2 border-r border-gray-300 text-center w-[13%] bg-blue-50">00:30 - 08:30</th>

              {/* ICU Sub-columns */}
              <th className="p-2 border-r border-gray-200 text-center w-[13%] bg-red-50">08:30 - 16:30</th>
              <th className="p-2 border-r border-gray-200 text-center w-[13%] bg-red-50">16:30 - 00:30</th>
              <th className="p-2 text-center w-[13%] bg-red-50">00:30 - 08:30</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-gray-100">
            {schedule.map((day, idx) => {
              const dateObj = new Date(day.date);
              const isHoliday = day.isHoliday;
              // Row background logic
              const rowClass = isHoliday ? 'bg-red-50/30' : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50');
              
              return (
                <tr key={day.date} className={`${rowClass} hover:bg-gray-100 transition-colors`}>
                  {/* Date Column */}
                  <td className={`p-2 border-r border-gray-300 sticky left-0 z-10 ${isHoliday ? 'bg-red-50' : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50')}`}>
                    <div className="flex flex-row items-center gap-2 justify-between px-2">
                       <span className="text-xs font-bold text-gray-500 w-6">{format(dateObj, 'EEE', { locale: th })}</span>
                       <span className={`text-sm font-semibold ${isHoliday ? 'text-red-700' : 'text-gray-800'}`}>{format(dateObj, 'd')}</span>
                    </div>
                    {day.holidayName && (
                        <div className="text-[10px] text-center text-red-600 bg-red-100/50 rounded mt-1 px-1 truncate">
                          {day.holidayName}
                        </div>
                    )}
                  </td>

                  {/* === GENERAL WARD === */}
                  {/* Morning */}
                  <td className="p-1 border-r border-gray-200 bg-blue-50/10">
                    {day.shifts.morning ? (
                      <DoctorSelect 
                        value={day.shifts.morning.general} 
                        onChange={(id) => updateSchedule(day.date, 'morning', 'general', id)}
                        date={day.date} 
                      />
                    ) : <div className="h-full w-full bg-gray-100/50 rounded flex items-center justify-center text-gray-300 text-xs">-</div>}
                  </td>
                  {/* Afternoon */}
                  <td className="p-1 border-r border-gray-200 bg-blue-50/10">
                    <DoctorSelect 
                        value={day.shifts.afternoon.general} 
                        onChange={(id) => updateSchedule(day.date, 'afternoon', 'general', id)}
                        date={day.date} 
                      />
                  </td>
                  {/* Night */}
                  <td className="p-1 border-r border-gray-300 bg-blue-50/10">
                     <DoctorSelect 
                        value={day.shifts.night.general} 
                        onChange={(id) => updateSchedule(day.date, 'night', 'general', id)}
                        date={day.date} 
                      />
                  </td>

                  {/* === ICU WARD === */}
                  {/* Morning */}
                  <td className="p-1 border-r border-gray-200 bg-red-50/10">
                    {day.shifts.morning ? (
                      <DoctorSelect 
                        value={day.shifts.morning.icu} 
                        onChange={(id) => updateSchedule(day.date, 'morning', 'icu', id)}
                        date={day.date} 
                      />
                    ) : <div className="h-full w-full bg-gray-100/50 rounded flex items-center justify-center text-gray-300 text-xs">-</div>}
                  </td>
                  {/* Afternoon */}
                  <td className="p-1 border-r border-gray-200 bg-red-50/10">
                    <DoctorSelect 
                        value={day.shifts.afternoon.icu} 
                        onChange={(id) => updateSchedule(day.date, 'afternoon', 'icu', id)}
                        date={day.date} 
                      />
                  </td>
                  {/* Night */}
                  <td className="p-1 bg-red-50/10">
                     <DoctorSelect 
                        value={day.shifts.night.icu} 
                        onChange={(id) => updateSchedule(day.date, 'night', 'icu', id)}
                        date={day.date} 
                      />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile/Tablet View (Card Layout) */}
      <div className="md:hidden">
        {schedule.map((day) => {
          const dateObj = new Date(day.date);
          const isHoliday = day.isHoliday;
          
          return (
            <div key={day.date} className={`p-4 border-b border-gray-200 ${isHoliday ? 'bg-red-50' : 'bg-white'}`}>
              <div className="flex justify-between items-center mb-3">
                <div className="flex flex-col">
                  <span className={`text-lg font-bold ${isHoliday ? 'text-red-700' : 'text-gray-800'}`}>
                    {format(dateObj, 'd MMM yyyy', { locale: th })}
                  </span>
                   {day.holidayName && (
                      <span className="text-xs text-red-600 font-medium bg-red-100 px-2 py-0.5 rounded-full inline-block">{day.holidayName}</span>
                   )}
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-bold">
                  {format(dateObj, 'EEEE', { locale: th })}
                </span>
              </div>

              <div className="space-y-4">
                 {/* General Section */}
                 <div className="rounded-lg border border-blue-200 overflow-hidden">
                    <div className="px-3 py-1.5 text-xs font-bold text-white flex justify-between" style={{ backgroundColor: '#7F95D1' }}>
                       <span>เวรสามัญ</span>
                    </div>
                    <div className="p-3 bg-blue-50/30 space-y-2">
                       {day.shifts.morning && (
                          <div className="grid grid-cols-3 items-center">
                            <span className="text-xs text-gray-500">เช้า (8.30-16.30)</span>
                            <div className="col-span-2">
                               <DoctorSelect value={day.shifts.morning.general} onChange={(id) => updateSchedule(day.date, 'morning', 'general', id)} date={day.date} />
                            </div>
                          </div>
                       )}
                       <div className="grid grid-cols-3 items-center">
                            <span className="text-xs text-gray-500">บ่าย (16.30-0.30)</span>
                            <div className="col-span-2">
                               <DoctorSelect value={day.shifts.afternoon.general} onChange={(id) => updateSchedule(day.date, 'afternoon', 'general', id)} date={day.date} />
                            </div>
                       </div>
                       <div className="grid grid-cols-3 items-center">
                            <span className="text-xs text-gray-500">ดึก (0.30-8.30)</span>
                            <div className="col-span-2">
                               <DoctorSelect value={day.shifts.night.general} onChange={(id) => updateSchedule(day.date, 'night', 'general', id)} date={day.date} />
                            </div>
                       </div>
                    </div>
                 </div>

                 {/* ICU Section */}
                 <div className="rounded-lg border border-red-200 overflow-hidden">
                    <div className="px-3 py-1.5 text-xs font-bold text-white flex justify-between" style={{ backgroundColor: '#F0725C' }}>
                       <span>เวร ICU</span>
                    </div>
                    <div className="p-3 bg-red-50/30 space-y-2">
                       {day.shifts.morning && (
                          <div className="grid grid-cols-3 items-center">
                            <span className="text-xs text-gray-500">เช้า (8.30-16.30)</span>
                            <div className="col-span-2">
                               <DoctorSelect value={day.shifts.morning.icu} onChange={(id) => updateSchedule(day.date, 'morning', 'icu', id)} date={day.date} />
                            </div>
                          </div>
                       )}
                       <div className="grid grid-cols-3 items-center">
                            <span className="text-xs text-gray-500">บ่าย (16.30-0.30)</span>
                            <div className="col-span-2">
                               <DoctorSelect value={day.shifts.afternoon.icu} onChange={(id) => updateSchedule(day.date, 'afternoon', 'icu', id)} date={day.date} />
                            </div>
                       </div>
                       <div className="grid grid-cols-3 items-center">
                            <span className="text-xs text-gray-500">ดึก (0.30-8.30)</span>
                            <div className="col-span-2">
                               <DoctorSelect value={day.shifts.night.icu} onChange={(id) => updateSchedule(day.date, 'night', 'icu', id)} date={day.date} />
                            </div>
                       </div>
                    </div>
                 </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ScheduleTable;
