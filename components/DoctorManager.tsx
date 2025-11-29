
import React, { useState } from 'react';
import { Doctor, ScheduleConfig } from '../types';
import { Plus, Trash2, User, Phone, Search, UserPlus, CalendarX, X, Power } from 'lucide-react';
import { format, getDaysInMonth } from 'date-fns';
import th from 'date-fns/locale/th';

interface Props {
  doctors: Doctor[];
  setDoctors: React.Dispatch<React.SetStateAction<Doctor[]>>;
  config: ScheduleConfig;
}

const DOCTOR_COLORS = [
  '#FFADAD', // Pastel Red
  '#FFD6A5', // Pastel Orange
  '#FDFFB6', // Pastel Yellow
  '#CAFFBF', // Pastel Green
  '#9BF6FF', // Pastel Cyan
  '#A0C4FF', // Pastel Blue
  '#BDB2FF', // Pastel Purple
  '#FFC6FF', // Pastel Pink
  '#E5E5E5', // Light Gray
  '#F0E68C', // Khaki
  '#E6E6FA', // Lavender
  '#FFF0F5', // Lavender Blush
];

const DoctorManager: React.FC<Props> = ({ doctors, setDoctors, config }) => {
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDocForLeave, setSelectedDocForLeave] = useState<Doctor | null>(null);

  const addDoctor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    // Assign color based on existing count to cycle through palette
    const color = DOCTOR_COLORS[doctors.length % DOCTOR_COLORS.length];
    
    const newDoc: Doctor = {
      id: crypto.randomUUID(),
      name: newName,
      phone: newPhone,
      unavailableDates: [],
      active: true, // Default to active
      color: color
    };
    setDoctors([...doctors, newDoc]);
    setNewName('');
    setNewPhone('');
  };

  const removeDoctor = (id: string) => {
    if(window.confirm('ต้องการลบรายชื่อนี้ใช่หรือไม่?')) {
      setDoctors(doctors.filter(d => d.id !== id));
    }
  };

  const toggleActiveStatus = (id: string) => {
    setDoctors(doctors.map(d => 
      d.id === id ? { ...d, active: !d.active } : d
    ));
  };

  const toggleUnavailableDate = (doctor: Doctor, dateStr: string) => {
    const isUnavailable = doctor.unavailableDates.includes(dateStr);
    let newDates;
    if (isUnavailable) {
      newDates = doctor.unavailableDates.filter(d => d !== dateStr);
    } else {
      newDates = [...doctor.unavailableDates, dateStr];
    }

    setDoctors(doctors.map(d => 
      d.id === doctor.id ? { ...d, unavailableDates: newDates } : d
    ));
    
    // Update local selection state so UI refreshes immediately
    setSelectedDocForLeave(prev => prev ? { ...prev, unavailableDates: newDates } : null);
  };

  const filteredDoctors = doctors.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.phone.includes(searchTerm)
  );

  // Calendar generation for modal
  const daysInMonth = getDaysInMonth(new Date(config.year, config.month));
  const firstDayOfMonth = new Date(config.year, config.month, 1).getDay();
  const emptySlots = Array.from({ length: firstDayOfMonth }, (_, i) => i);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/50">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <User className="text-medical-600" /> จัดการรายชื่อแพทย์
            </h2>
            <p className="text-sm text-gray-500 mt-1">เพิ่ม ลบ แก้ไขข้อมูล และกำหนดสถานะ (Active/Inactive)</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text"
              placeholder="ค้นหาชื่อ หรือ เบอร์โทร..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-400 outline-none w-full md:w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="p-6 bg-white">
          <form onSubmit={addDoctor} className="flex flex-col md:flex-row gap-3 items-end mb-8 p-4 bg-medical-50 rounded-xl border border-medical-100">
             <div className="flex-1 w-full">
               <label className="block text-xs font-semibold text-gray-600 mb-1 ml-1">ชื่อ-นามสกุล</label>
               <input
                type="text"
                placeholder="Ex. นพ. ใจดี รักษาดี"
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-400 outline-none bg-white"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
             </div>
             <div className="w-full md:w-1/3">
               <label className="block text-xs font-semibold text-gray-600 mb-1 ml-1">เบอร์ติดต่อ</label>
               <input
                type="text"
                placeholder="08x-xxx-xxxx"
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-400 outline-none bg-white"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
             </div>
             <button
              type="submit"
              className="w-full md:w-auto bg-medical-600 text-white px-6 py-2.5 rounded-lg hover:bg-medical-700 transition flex items-center justify-center gap-2 font-medium"
            >
              <UserPlus size={20} /> เพิ่มแพทย์
            </button>
          </form>

          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-4 text-sm font-semibold text-gray-600 w-16 text-center">สถานะ</th>
                  <th className="p-4 text-sm font-semibold text-gray-600">ชื่อ-นามสกุล</th>
                  <th className="p-4 text-sm font-semibold text-gray-600">เบอร์ติดต่อ</th>
                  <th className="p-4 text-sm font-semibold text-gray-600 text-center">วันไม่ว่าง</th>
                  <th className="p-4 text-sm font-semibold text-gray-600 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {doctors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400">
                      ยังไม่มีข้อมูลแพทย์ กรุณาเพิ่มรายชื่อ
                    </td>
                  </tr>
                ) : filteredDoctors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400">
                      ไม่พบข้อมูลที่ค้นหา
                    </td>
                  </tr>
                ) : (
                  filteredDoctors.map(doc => (
                    <tr key={doc.id} className={`hover:bg-gray-50 transition group ${!doc.active ? 'bg-gray-50/50' : ''}`}>
                      <td className="p-4 text-center">
                         <button
                          onClick={() => toggleActiveStatus(doc.id)}
                          className={`
                             w-8 h-8 rounded-full flex items-center justify-center transition-colors
                             ${doc.active ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-200 text-gray-400 hover:bg-gray-300'}
                          `}
                          title={doc.active ? "สถานะ: Active" : "สถานะ: Inactive"}
                         >
                           <Power size={16} />
                         </button>
                      </td>
                      <td className={`p-4 font-medium ${doc.active ? 'text-gray-800' : 'text-gray-400 line-through decoration-gray-300'}`}>
                        <div className="flex items-center gap-3">
                           <div 
                              className="w-4 h-4 rounded-full border border-gray-200 shadow-sm flex-shrink-0" 
                              style={{ backgroundColor: doc.color || '#eee' }} 
                              title={`Color code: ${doc.color}`}
                           ></div>
                           <span>
                             {doc.name}
                             {!doc.active && <span className="ml-2 text-xs font-normal text-gray-400 no-underline">(Inactive)</span>}
                           </span>
                        </div>
                      </td>
                      <td className={`p-4 font-mono text-sm ${doc.active ? 'text-gray-600' : 'text-gray-400'}`}>
                        {doc.phone || '-'}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => setSelectedDocForLeave(doc)}
                          disabled={!doc.active}
                          className={`
                            inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition
                            ${!doc.active ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-400' : 
                               doc.unavailableDates?.length > 0 
                                ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }
                          `}
                        >
                          <CalendarX size={14} />
                          {doc.unavailableDates?.length > 0 
                             ? `${doc.unavailableDates.length} วัน`
                             : 'ระบุวันลา'}
                        </button>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => removeDoctor(doc.id)}
                          className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition"
                          title="ลบรายชื่อ"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-between items-center text-sm text-gray-500">
             <div className="flex gap-4">
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 rounded-full"></div> Active ({doctors.filter(d => d.active).length})</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 bg-gray-300 rounded-full"></div> Inactive ({doctors.filter(d => !d.active).length})</span>
             </div>
             <div>จำนวนแพทย์ทั้งหมด {doctors.length} ท่าน</div>
          </div>
        </div>
      </div>

      {/* Leave Management Modal */}
      {selectedDocForLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <CalendarX className="text-red-500" size={20} />
                ระบุวันไม่ว่าง: {selectedDocForLeave.name}
              </h3>
              <button 
                onClick={() => setSelectedDocForLeave(null)}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 p-1 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="text-center mb-4">
                <span className="text-lg font-semibold text-gray-700">
                  {format(new Date(config.year, config.month), 'MMMM yyyy', { locale: th })}
                </span>
                <p className="text-sm text-gray-500">คลิกที่วันที่ต้องการระบุว่าไม่ว่าง</p>
              </div>

              <div className="grid grid-cols-7 gap-2 mb-2">
                {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d, i) => (
                  <div key={i} className="text-center text-xs font-bold text-gray-400">{d}</div>
                ))}
              </div>
              
              <div className="grid grid-cols-7 gap-2">
                {emptySlots.map(s => <div key={`empty-${s}`} className="aspect-square"></div>)}
                {daysArray.map(day => {
                   const date = new Date(config.year, config.month, day);
                   const dateStr = format(date, 'yyyy-MM-dd');
                   const isUnavailable = selectedDocForLeave.unavailableDates?.includes(dateStr);
                   
                   return (
                     <button
                       key={day}
                       onClick={() => toggleUnavailableDate(selectedDocForLeave, dateStr)}
                       className={`
                         aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-all
                         ${isUnavailable 
                           ? 'bg-red-500 text-white shadow-md scale-105' 
                           : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}
                       `}
                     >
                       {day}
                     </button>
                   );
                })}
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedDocForLeave(null)}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition text-sm font-medium"
                >
                  บันทึกและปิด
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorManager;
