import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import OrderModal from './OrderModal';
import EditOrderItemsModal from './EditOrderItemsModal';

type Item = {
  id: string;
  name: string;
  category: 'campsite' | 'equipment' | 'service';
  price_weekday: number;
  price_holiday: number;
  price_original: number;
  image_url?: string | null;
};

type OrderItem = {
  id: string;
  item_id: string;
  quantity: number;
  unit_price: number;
  nf_items: Item;
};

type Order = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_phone: string;
  license_plate: string | null;
  check_in_date: string;
  check_out_date: string;
  total_amount: number;
  status: 'pending' | 'deposit_paid' | 'paid' | 'checked_in' | 'cancelled';
  deposit_amount?: number;
  notes: string | null;
  admin_notes: string | null;
  discount_code: string | null;
  discount_amount: number;
  ecpay_trade_no: string | null;
  payment_method: string | null;
  virtual_account: string | null;
  nf_order_items: OrderItem[];
};

type PaymentLog = {
  id: string;
  order_id: string;
  amount: number;
  payment_type: 'bank_transfer' | 'onsite';
  collected_by: string;
  collected_at: string;
  notes: string | null;
};

const parseOrderNotes = (notesStr: string | null) => {
  if (!notesStr) return { email: '', people: '', notes: '' };
  const emailMatch = notesStr.match(/\[Email:\s*(.*?)\]/);
  const peopleMatch = notesStr.match(/\[人數:\s*(.*?)\]/);
  let email = emailMatch ? emailMatch[1] : '';
  if (email.includes('@line.notfar.com') || email.includes('@dummy-line.com')) {
    email = '';
  }
  const people = peopleMatch ? peopleMatch[1] : '';
  const notes = notesStr.replace(/\[Email:\s*.*?\]\s*/, '').replace(/\[人數:\s*.*?\]\s*/, '').trim();
  return { email, people, notes };
};

export default function OrdersManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'overdue' | 'deposit_paid' | 'paid' | 'checked_in' | 'cancelled'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFinancialsId, setEditingFinancialsId] = useState<string | null>(null);
  const [financialsForm, setFinancialsForm] = useState({ total_amount: '', deposit_amount: '' });
  const [editingOrderItemsOrder, setEditingOrderItemsOrder] = useState<Order | null>(null);
  const [replyingToOrderId, setReplyingToOrderId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [editingAdminNoteOrderId, setEditingAdminNoteOrderId] = useState<string | null>(null);
  const [adminNoteText, setAdminNoteText] = useState('');
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [paymentLogs, setPaymentLogs] = useState<Record<string, PaymentLog[]>>({});
  const [onsitePaymentOrderId, setOnsitePaymentOrderId] = useState<string | null>(null);
  const [editingCustomerOrderId, setEditingCustomerOrderId] = useState<string | null>(null);
  const [customerEditForm, setCustomerEditForm] = useState({
    customer_name: '',
    customer_phone: '',
    email: '',
    adults: '2',
    children: '0',
    notes: ''
  });
  const [onsiteAmount, setOnsiteAmount] = useState('');
  const [onsiteNotes, setOnsiteNotes] = useState('');
  const [isSubmittingOnsite, setIsSubmittingOnsite] = useState(false);
  const [onlinePaymentOrderId, setOnlinePaymentOrderId] = useState<string | null>(null);
  const [onlinePaymentType, setOnlinePaymentType] = useState<'credit_card' | 'bank_transfer'>('bank_transfer');
  const [onlinePaymentAmount, setOnlinePaymentAmount] = useState('');
  const [isSubmittingOnline, setIsSubmittingOnline] = useState(false);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  const getMonthsList = () => {
    const list = [];
    const date = new Date();
    for (let i = 0; i < 12; i++) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      list.push(`${year}-${month}`);
      date.setMonth(date.getMonth() - 1);
    }
    return list;
  };

  const handleMonthChange = (monthVal: string) => {
    setSelectedMonth(monthVal);
    if (monthVal === 'all') {
      setStartDate('');
      setEndDate('');
    } else {
      const [yearStr, monthStr] = monthVal.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDayNum = new Date(year, month, 0).getDate();
      const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
      setStartDate(firstDay);
      setEndDate(lastDay);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    const campId = localStorage.getItem('camp_id');

    const { data, error } = await supabase
      .from('nf_orders')
      .select(`
        *,
        nf_order_items (
          *,
          nf_items (*)
        )
      `)
      .eq('camp_id', campId)
      .order('check_in_date', { ascending: true });

    if (error) {
      console.error('Error fetching orders:', error);
    } else {
      setOrders(data || []);

      // 撈金流明細（只撈此營區的訂單）
      if (data && data.length > 0) {
        const orderIds = data.map(o => o.id);
        const { data: logs } = await supabase
          .from('nf_payment_logs')
          .select('*')
          .in('order_id', orderIds)
          .order('collected_at', { ascending: true });

        if (logs) {
          const grouped: Record<string, PaymentLog[]> = {};
          logs.forEach((log: PaymentLog) => {
            if (!grouped[log.order_id]) grouped[log.order_id] = [];
            grouped[log.order_id].push(log);
          });
          setPaymentLogs(grouped);
        }
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
    setAdminRole(localStorage.getItem('admin_role') || 'viewer');
    setAdminEmail(localStorage.getItem('admin_email') || '');
  }, []);

  const updateOrderStatus = async (orderId: string, newStatus: 'pending' | 'deposit_paid' | 'paid' | 'checked_in' | 'cancelled') => {
    if (!confirm(`確定要將此訂單標記為「${newStatus === 'paid' ? '已付款' : newStatus === 'cancelled' ? '已取消' : newStatus === 'checked_in' ? '已報到' : '狀態變更'}」嗎？`)) return;

    // 如果是取消訂單，退還庫存
    if (newStatus === 'cancelled') {
      const order = orders.find(o => o.id === orderId);
      if (order && order.status !== 'cancelled') {
        const start = new Date(order.check_in_date);
        const end = new Date(order.check_out_date);
        
        for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          const isFirstNight = d.getTime() === start.getTime();
          
          for (const oi of order.nf_order_items) {
            const isSingleTime = oi.nf_items?.category === 'service' && (oi.nf_items?.name.includes('單次') || oi.nf_items?.name.includes('次計費'));
            if (isSingleTime && !isFirstNight) continue;

            const { data: inv } = await supabase
              .from('nf_inventory')
              .select('id, booked_quantity')
              .eq('date', dateStr)
              .eq('item_id', oi.item_id)
              .single();
              
            if (inv && inv.booked_quantity > 0) {
              await supabase
                .from('nf_inventory')
                .update({ booked_quantity: Math.max(0, inv.booked_quantity - oi.quantity) })
                .eq('id', inv.id);
            }
          }
        }
      }
    }
    
    const orderToUpdate = orders.find(o => o.id === orderId);
    let updateData: any = { status: newStatus };
    // 如果手動標記為「已付款」，我們順便把「已收定金」直接填滿為「總金額」，確保資料的一致性
    if (newStatus === 'paid' && orderToUpdate) {
      updateData.deposit_amount = orderToUpdate.total_amount;
    }

    const { error } = await supabase
      .from('nf_orders')
      .update(updateData)
      .eq('id', orderId);

    if (error) {
      alert('更新失敗: ' + error.message);
    } else {
      fetchOrders();
      try {
        const actionType = newStatus === 'cancelled' ? 'cancelled' : 'status_update';
        const updatedOrder = { ...orderToUpdate, ...updateData };
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionType, orderData: updatedOrder, updateReason: '已更改訂單狀態' })
        });
      } catch (e) { console.error('Email error', e); }
    }
  };

  const deleteOrder = async (orderId: string) => {
    if (!confirm('警告：確定要刪除這筆訂單嗎？此動作無法復原！(通常建議使用「取消訂單」保留紀錄)')) return;
    
    // 找出這筆訂單
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // 如果訂單尚未取消，強制退還庫存
    if (order.status !== 'cancelled') {
      const start = new Date(order.check_in_date);
      const end = new Date(order.check_out_date);
      
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const isFirstNight = d.getTime() === start.getTime();

        for (const oi of order.nf_order_items) {
          const isSingleTime = oi.nf_items?.category === 'service' && (oi.nf_items?.name.includes('單次') || oi.nf_items?.name.includes('次計費'));
          if (isSingleTime && !isFirstNight) continue;

          const { data: inv } = await supabase
            .from('nf_inventory')
            .select('id, booked_quantity')
            .eq('date', dateStr)
            .eq('item_id', oi.item_id)
            .single();
            
          if (inv && inv.booked_quantity > 0) {
            await supabase
              .from('nf_inventory')
              .update({ booked_quantity: Math.max(0, inv.booked_quantity - oi.quantity) })
              .eq('id', inv.id);
          }
        }
      }
    }

    // 先刪除關聯的訂單明細 (避免 Foreign Key 阻擋)
    await supabase.from('nf_order_items').delete().eq('order_id', orderId);

    // 最後刪除主訂單
    const { error } = await supabase
      .from('nf_orders')
      .delete()
      .eq('id', orderId);

    if (error) {
      alert('刪除失敗: ' + error.message);
    } else {
      fetchOrders();
    }
  };

  const submitReply = async (orderId: number, currentNote: string | null) => {
    if (!replyText.trim()) return;
    setIsSubmittingReply(true);
    const newNote = (currentNote || '') + (currentNote ? '\n\n' : '') + '[店家回覆]：' + replyText.trim();
    const { error } = await supabase.from('nf_orders').update({ notes: newNote }).eq('id', orderId);
    setIsSubmittingReply(false);
    
    if (error) {
      alert('更新失敗');
    } else {
      setReplyingToOrderId(null);
      setReplyText('');
      fetchOrders();
      try {
        const currentOrder = orders.find(o => o.id === orderId);
        if (currentOrder) {
          const updatedOrder = { ...currentOrder, notes: newNote };
          fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actionType: 'status_update', orderData: updatedOrder, updateReason: '已新增店家回覆' })
          });
        }
      } catch (e) { console.error('Email error', e); }
    }
  };

  const submitAdminNote = async (orderId: string) => {
    setIsSubmittingReply(true);
    const { error } = await supabase.from('nf_orders').update({ admin_notes: adminNoteText }).eq('id', orderId);
    setIsSubmittingReply(false);
    
    if (error) {
      alert('更新失敗');
    } else {
      setEditingAdminNoteOrderId(null);
      setAdminNoteText('');
      fetchOrders();
    }
  };

  const openFinancialsModal = (order: Order) => {
    // 如果是已付款狀態且沒有設定定金，代表他付了全額，我們把原本的總額當作已付定金帶入
    let paidAmount = order.deposit_amount || 0;
    if (paidAmount === 0 && (order.status === 'paid' || order.status === 'checked_in')) {
      paidAmount = order.total_amount;
    }

    setFinancialsForm({
      total_amount: order.total_amount?.toString() || '0',
      deposit_amount: paidAmount.toString()
    });
    setEditingFinancialsId(order.id);
  };

  const saveFinancials = async () => {
    if (!editingFinancialsId) return;
    const total = parseInt(financialsForm.total_amount) || 0;
    const deposit = parseInt(financialsForm.deposit_amount) || 0;
    const newStatus = deposit > 0 && deposit < total ? 'deposit_paid' : (deposit >= total ? 'paid' : 'pending');

    const currentOrder = orders.find(o => o.id === editingFinancialsId);
    let finalStatus = currentOrder?.status;
    // 如果原本是已取消或已報到，我們不改他的狀態，只改金額
    if (finalStatus !== 'cancelled' && finalStatus !== 'checked_in') {
      finalStatus = newStatus as any;
    }

    const { error } = await supabase
      .from('nf_orders')
      .update({ total_amount: total, deposit_amount: deposit, status: finalStatus })
      .eq('id', editingFinancialsId);

    if (error) {
      alert('更新金額失敗：' + error.message);
    } else {
      fetchOrders();
      setEditingFinancialsId(null);
      try {
        const updatedOrder = { ...currentOrder, total_amount: total, deposit_amount: deposit, status: finalStatus };
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionType: 'status_update', orderData: updatedOrder, updateReason: '已更新訂單金額' })
        });
      } catch (e) { console.error('Email error', e); }
    }
  };

  // 現場收款處理
  const submitOnsitePayment = async () => {
    if (!onsitePaymentOrderId) return;
    const amount = parseInt(onsiteAmount);
    if (!amount || amount === 0) {
      alert('請輸入有效的金額（正數收款、負數沖正）');
      return;
    }

    const order = orders.find(o => o.id === onsitePaymentOrderId);
    if (order) {
      const totalPaid = getOrderOnlineAmount(order.id) + getOrderOnsiteAmount(order.id) + (order.deposit_amount || 0);
      const newTotalPaid = totalPaid + amount;

      // 多收（正數）時檢查是否超過剩餘待收
      if (amount > 0 && newTotalPaid > order.total_amount) {
        alert(`⚠️ 溢收！最多只能再收 NT$ ${Math.max(0, order.total_amount - totalPaid).toLocaleString()}`);
        return;
      }

      // 退款（負數）時檢查會不會退超過已收總額
      if (amount < 0 && newTotalPaid < 0) {
        alert(`⚠️ 退款不能超過已收總額 NT$ ${totalPaid.toLocaleString()}`);
        return;
      }
    }

    setIsSubmittingOnsite(true);

    const { error } = await supabase
      .from('nf_payment_logs')
      .insert({
        order_id: onsitePaymentOrderId,
        amount,
        payment_type: 'onsite',
        collected_by: adminEmail,
        notes: onsiteNotes.trim() || null
      });

    setIsSubmittingOnsite(false);
    if (error) {
      alert('現場收款紀錄失敗：' + error.message);
      return;
    }

    // DB Trigger 會自動更新 deposit_amount & status
    setOnsitePaymentOrderId(null);
    setOnsiteAmount('');
    setOnsiteNotes('');
    fetchOrders();
  };

  const getPaymentLogs = (orderId: string): PaymentLog[] => {
    return paymentLogs[orderId] || [];
  };

  // 所有線上付款（信用卡 + 匯款）
  const getOrderOnlineAmount = (orderId: string): number => {
    return getPaymentLogs(orderId)
      .filter(l => l.payment_type === 'bank_transfer' || l.payment_type === 'credit_card')
      .reduce((sum, l) => sum + l.amount, 0);
  };

  // 現場收款
  const getOrderOnsiteAmount = (orderId: string): number => {
    return getPaymentLogs(orderId)
      .filter(l => l.payment_type === 'onsite')
      .reduce((sum, l) => sum + l.amount, 0);
  };

  // 線上付款（信用卡／匯款）
  const submitOnlinePayment = async () => {
    if (!onlinePaymentOrderId) return;
    const amount = parseInt(onlinePaymentAmount);
    if (!amount || amount === 0) {
      alert('請輸入有效的金額（正數收款、負數沖正）');
      return;
    }

    const order = orders.find(o => o.id === onlinePaymentOrderId);
    if (!order) return;

    let totalFromLogs = getOrderOnlineAmount(order.id) + getOrderOnsiteAmount(order.id);
    const deposit = order.deposit_amount || 0;
    // deposit_amount 應等於 totalFromLogs，但以防手動微調過，取最大值
    const effectiveTotal = Math.max(deposit, totalFromLogs);
    const newTotalPaid = effectiveTotal + amount;

    // 多收時檢查
    if (amount > 0 && newTotalPaid > order.total_amount) {
      alert(`⚠️ 溢收！最多只能再收 NT$ ${Math.max(0, order.total_amount - effectiveTotal).toLocaleString()}`);
      return;
    }

    // 退款時檢查
    if (amount < 0 && newTotalPaid < 0) {
      alert(`⚠️ 退款不能超過已收總額 NT$ ${effectiveTotal.toLocaleString()}`);
      return;
    }

    setIsSubmittingOnline(true);

    const { error: logError } = await supabase.from('nf_payment_logs').insert({
      order_id: onlinePaymentOrderId,
      amount,
      payment_type: onlinePaymentType,
      collected_by: adminEmail,
      notes: null
    });

    if (logError) {
      alert('線上付款紀錄失敗：' + logError.message);
      setIsSubmittingOnline(false);
      return;
    }

    // DB Trigger 會自動更新 deposit_amount & status
    setIsSubmittingOnline(false);
    setOnlinePaymentOrderId(null);
    setOnlinePaymentAmount('');
    fetchOrders();
  };

  const filteredOrders = orders.filter(order => {
    // 1. 日期範圍篩選
    if (startDate && order.check_in_date < startDate) return false;
    if (endDate && order.check_in_date > endDate) return false;

    // 2. 狀態篩選
    const todayStr = new Date(new Date().getTime() + 8 * 3600000).toISOString().split('T')[0];
    
    let matchesStatus = false;
    if (activeTab === 'all') {
      matchesStatus = true;
    } else if (activeTab === 'pending') {
      // 待付款：入住日期在今天或未來
      matchesStatus = order.status === 'pending' && order.check_in_date >= todayStr;
    } else if (activeTab === 'overdue') {
      // 已逾期：入住日期在今天之前
      matchesStatus = order.status === 'pending' && order.check_in_date < todayStr;
    } else {
      matchesStatus = order.status === activeTab;
    }

    // 3. 關鍵字搜尋
    const matchesSearch = searchTerm === '' || 
      order.order_no.toLowerCase().includes(searchTerm.toLowerCase()) || 
      order.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer_phone.includes(searchTerm) ||
      order.check_in_date.includes(searchTerm) ||
      order.check_out_date.includes(searchTerm);
      
    return matchesStatus && matchesSearch;
  });

  const stats = useMemo(() => {
    let creditCardTotal = 0;
    let bankTransferTotal = 0;
    let onsiteTotal = 0;
    let receivableTotal = 0;
    let totalAmountSum = 0;

    filteredOrders.forEach(order => {
      // 只有非取消的訂單計算總金額與應收
      if (order.status !== 'cancelled') {
        totalAmountSum += order.total_amount;
        receivableTotal += Math.max(0, order.total_amount - (order.deposit_amount || 0));
      }

      // 金流加總
      const logs = paymentLogs[order.id] || [];
      logs.forEach(log => {
        if (log.payment_type === 'credit_card') {
          creditCardTotal += log.amount;
        } else if (log.payment_type === 'bank_transfer') {
          bankTransferTotal += log.amount;
        } else if (log.payment_type === 'onsite') {
          onsiteTotal += log.amount;
        } else {
          onsiteTotal += log.amount;
        }
      });
    });

    const receivedTotal = creditCardTotal + bankTransferTotal + onsiteTotal;

    return {
      totalAmountSum,
      creditCardTotal,
      bankTransferTotal,
      onsiteTotal,
      receivedTotal,
      receivableTotal
    };
  }, [filteredOrders, paymentLogs]);

  const sortedOrders = useMemo(() => {
    const todayStr = new Date(new Date().getTime() + 8 * 3600000).toISOString().split('T')[0];
    return [...filteredOrders].sort((a, b) => {
      const aIsOverdue = a.status === 'pending' && a.check_in_date < todayStr;
      const bIsOverdue = b.status === 'pending' && b.check_in_date < todayStr;
      const aIsCancelled = a.status === 'cancelled';
      const bIsCancelled = b.status === 'cancelled';

      const aIsEnd = aIsOverdue || aIsCancelled;
      const bIsEnd = bIsOverdue || bIsCancelled;

      if (aIsEnd && !bIsEnd) return 1;
      if (!aIsEnd && bIsEnd) return -1;
      
      return a.check_in_date.localeCompare(b.check_in_date);
    });
  }, [filteredOrders]);

  const getStatusBadge = (status: string, checkInDate: string) => {
    const todayStr = new Date(new Date().getTime() + 8 * 3600000).toISOString().split('T')[0];
    switch (status) {
      case 'paid': return <span className="whitespace-nowrap shrink-0 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200">已付款</span>;
      case 'deposit_paid': return <span className="whitespace-nowrap shrink-0 px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-bold border border-teal-200 shadow-sm">🪙 已付定金</span>;
      case 'checked_in': return <span className="whitespace-nowrap shrink-0 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-200">✅ 已報到</span>;
      case 'pending': {
        const isOverdue = checkInDate < todayStr;
        return isOverdue ? (
          <span className="whitespace-nowrap shrink-0 px-3 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-bold border border-rose-200">已逾期</span>
        ) : (
          <span className="whitespace-nowrap shrink-0 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold border border-amber-200">待付款</span>
        );
      }
      case 'cancelled': return <span className="whitespace-nowrap shrink-0 px-3 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-bold border border-rose-200">已取消</span>;
      default: return null;
    }
  };

  const handleExportCSV = () => {
    const headers = [
      '訂單編號', '訂購人姓名', '聯絡電話', '車牌號碼', '入住日期', '退房日期', '訂單狀態', 
      '總金額(元)', '已收金額(元)', '未付尾款(元)', 
      '實收-信用卡(元)', '實收-匯款(元)', '實收-現場(元)',
      '虛擬匯款帳號', '客人備註', '營主內部備註', '折扣碼', '折扣金額', '下單時間'
    ];
    
    const rows = filteredOrders.map(order => {
      let creditCard = 0;
      let bankTransfer = 0;
      let onsite = 0;
      
      const logs = paymentLogs[order.id] || [];
      logs.forEach(log => {
        if (log.payment_type === 'credit_card') {
          creditCard += log.amount;
        } else if (log.payment_type === 'bank_transfer') {
          bankTransfer += log.amount;
        } else if (log.payment_type === 'onsite') {
          onsite += log.amount;
        } else {
          onsite += log.amount;
        }
      });
      
      const received = creditCard + bankTransfer + onsite;
      const receivable = order.status === 'cancelled' ? 0 : Math.max(0, order.total_amount - received);
      
      const statusText = order.status === 'paid' ? '已付款' : order.status === 'deposit_paid' ? '已付定金' : order.status === 'pending' ? (order.check_in_date < new Date(new Date().getTime() + 8 * 3600000).toISOString().split('T')[0] ? '已逾期' : '待付款') : order.status === 'checked_in' ? '已報到' : '已取消';

      return [
        order.order_no,
        order.customer_name,
        order.customer_phone,
        order.license_plate || '',
        order.check_in_date,
        order.check_out_date,
        statusText,
        order.total_amount,
        received,
        receivable,
        creditCard,
        bankTransfer,
        onsite,
        order.virtual_account ? `"${order.virtual_account}"` : '',
        `"${(order.notes || '').replace(/"/g, '""')}"`,
        `"${(order.admin_notes || '').replace(/"/g, '""')}"`,
        order.discount_code || '',
        order.discount_amount || 0,
        new Date(order.created_at).toLocaleString('zh-TW')
      ];
    });

    // 加上財務匯總報表資訊於底部
    const summaryRows = [
      [],
      ['【篩選區間財務加總報表】'],
      ['總營業額 (訂單總額)', `${stats.totalAmountSum} 元`],
      ['已收總額 (實收營收)', `${stats.receivedTotal} 元`],
      ['未付尾款 (應收帳款)', `${stats.receivableTotal} 元`],
      ['實收：信用卡 (綠界)', `${stats.creditCardTotal} 元`],
      ['實收：虛擬匯款', `${stats.bankTransferTotal} 元`],
      ['實收：現場/現金', `${stats.onsiteTotal} 元`]
    ];

    const allCsvRows = [
      headers.join(','), 
      ...rows.map(e => e.join(',')),
      ...summaryRows.map(e => e.join(','))
    ];

    const csvContent = '\uFEFF' + allCsvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orders_finance_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white md:rounded-2xl shadow-sm border border-stone-200 flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-48px)] w-full">
      
      {/* 整個列表、搜尋、時間篩選及統計都放入同一個滾動容器，以實現整體滾動（不置頂） */}
      <div className="flex-1 overflow-auto bg-stone-50 rounded-2xl flex flex-col">
        
        {/* Row 1: 搜尋、時間篩選、手動接單與匯出 */}
        <div className="p-4 md:p-6 pb-3.5 bg-white md:rounded-t-2xl border-b border-stone-100 flex flex-wrap items-center justify-between gap-4 shrink-0">
          {/* 左側：搜尋 + 時間篩選 */}
          <div className="flex flex-wrap items-center gap-4 flex-1 min-w-[300px]">
            {/* 搜尋框 */}
            <div className="relative w-full sm:w-60">
              <input 
                type="text" 
                placeholder="搜尋姓名、電話、訂單、日期..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50">🔍</span>
            </div>

            {/* 快速選月 */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-stone-500 whitespace-nowrap">快速選月:</span>
              <select
                value={selectedMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="bg-stone-50 border border-stone-200 rounded-lg text-sm px-2.5 py-1.5 font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <option value="all">所有時間</option>
                {getMonthsList().map(m => (
                  <option key={m} value={m}>{m.replace('-', '年')}月</option>
                ))}
              </select>
            </div>

            {/* 自訂日期 */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-stone-500 whitespace-nowrap">自訂日期:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setSelectedMonth('custom');
                }}
                className="bg-stone-50 border border-stone-200 rounded-lg text-sm px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500/50 h-[34px]"
              />
              <span className="text-stone-400 text-xs">至</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setSelectedMonth('custom');
                }}
                className="bg-stone-50 border border-stone-200 rounded-lg text-sm px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500/50 h-[34px]"
              />
            </div>
          </div>

          {/* 右側：匯出與手動接單按鈕 */}
          <div className="flex items-center gap-3">
            <button 
              onClick={handleExportCSV}
              className="bg-white text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-lg font-bold text-sm tracking-wider transition-colors shadow-sm border border-emerald-200 flex items-center justify-center gap-2 whitespace-nowrap"
            >
              📥 匯出 Excel
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-emerald-700 text-emerald-50 hover:bg-stone-700 px-5 py-2 rounded-lg font-bold text-sm tracking-wider transition-colors shadow-sm border border-stone-700 flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <span className="text-base leading-none mb-0.5">+</span> 手動接單
            </button>
          </div>
        </div>

        {/* Row 2: 狀態分頁標籤 */}
        <div className="px-4 md:px-6 pt-2 border-b border-stone-200 bg-white shrink-0">
          <div className="flex gap-2 md:gap-4 overflow-x-auto hide-scrollbar w-full md:w-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: '全部訂單' },
              { id: 'pending', label: '待付款' },
              { id: 'deposit_paid', label: '已付定金' },
              { id: 'paid', label: '已付款' },
              { id: 'checked_in', label: '已報到' },
              { id: 'overdue', label: '已逾期' },
              { id: 'cancelled', label: '已取消' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 md:px-5 md:py-2.5 rounded-t-lg font-bold text-sm transition-all border-b-2 whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'border-amber-500 text-amber-600 bg-amber-50/50' 
                    : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 3: 區間財務看板 */}
        <div className="p-4 md:p-6 pb-2 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-stone-700">📊 區間財務明細加總</h3>
            <div className="text-xs font-medium text-stone-500 bg-stone-200/50 px-2.5 py-1 rounded-md border border-stone-200/50">
              篩選區間內共有 <span className="font-bold text-amber-600">{filteredOrders.length}</span> 筆訂單
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm flex flex-col justify-between">
              <span className="text-[11px] font-bold text-stone-400">總營業額 (訂單總額)</span>
              <span className="text-lg font-black text-stone-700 mt-1">NT$ {stats.totalAmountSum.toLocaleString()}</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm flex flex-col justify-between border-l-4 border-l-emerald-500">
              <span className="text-[11px] font-bold text-stone-400">已收總額 (實收月營收)</span>
              <span className="text-lg font-black text-emerald-600 mt-1">NT$ {stats.receivedTotal.toLocaleString()}</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm flex flex-col justify-between border-l-4 border-l-rose-500">
              <span className="text-[11px] font-bold text-stone-400">未付尾款 (應收帳款)</span>
              <span className="text-lg font-black text-rose-600 mt-1">NT$ {stats.receivableTotal.toLocaleString()}</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm flex flex-col justify-between">
              <span className="text-[11px] font-bold text-stone-400">實收：信用卡 (綠界)</span>
              <span className="text-lg font-bold text-blue-600 mt-1">NT$ {stats.creditCardTotal.toLocaleString()}</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm flex flex-col justify-between">
              <span className="text-[11px] font-bold text-stone-400">實收：虛擬匯款</span>
              <span className="text-lg font-bold text-stone-600 mt-1">NT$ {stats.bankTransferTotal.toLocaleString()}</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm flex flex-col justify-between">
              <span className="text-[11px] font-bold text-stone-400">實收：現場/現金</span>
              <span className="text-lg font-bold text-teal-600 mt-1">NT$ {stats.onsiteTotal.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Row 4: 訂單列表區域 */}
        <div className="flex-1 p-4 md:p-6 pb-32 md:pb-32 bg-stone-50 min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-amber-600/60 space-y-4 min-h-[300px]">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
              <p className="font-medium tracking-widest text-sm">載入訂單資料中...</p>
            </div>
          ) : sortedOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-stone-400 space-y-4 bg-white rounded-xl border border-stone-200/50 border-dashed min-h-[300px]">
              <span className="text-5xl opacity-50">🏕️</span>
              <p className="font-medium tracking-wider">目前沒有符合條件的訂單</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6 items-stretch">
              {sortedOrders.map(order => {
              const parsed = parseOrderNotes(order.notes);
              return (
              <div key={order.id} className={`bg-white rounded-xl border ${order.status === 'cancelled' ? 'border-rose-100 opacity-75' : 'border-stone-200'} shadow-sm overflow-hidden flex flex-col group transition-all hover:shadow-md`}>
                {/* 訂單表頭 */}
                <div className={`bg-stone-100/50 border-b ${order.status === 'cancelled' ? 'border-rose-100' : 'border-stone-100'} px-4 sm:px-5 py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0`}>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="font-mono text-xs text-stone-500 bg-stone-200/70 px-2 py-1 rounded">
                      {order.order_no}
                    </span>
                    {getStatusBadge(order.status, order.check_in_date)}
                  </div>
                  <div className="text-xs text-stone-400">
                    下單時間: {new Date(order.created_at.endsWith('Z') || order.created_at.includes('+') ? order.created_at : order.created_at + 'Z').toLocaleString('zh-TW', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                      hour12: false
                    })}
                  </div>
                </div>
                
                {/* 訂單內容 */}
                <div className="p-5 flex flex-col md:flex-row gap-6 flex-1">
                  {/* 客戶資訊 */}
                  <div className="w-full md:w-1/2 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${order.status === 'cancelled' ? 'bg-rose-50 text-rose-500 border-rose-200' : 'bg-amber-50 text-amber-600 border-amber-200'} flex items-center justify-center font-bold text-lg border`}>
                        {order.customer_name.charAt(0)}
                      </div>
                      <div>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <h3 className={`font-bold text-lg truncate ${order.status === 'cancelled' ? 'text-stone-500 line-through' : 'text-stone-800'}`}>{order.customer_name}</h3>
                        {adminRole !== 'viewer' && (
                          <button onClick={() => {
                            setCustomerEditForm({
                              customer_name: order.customer_name,
                              customer_phone: order.customer_phone,
                              email: parsed.email,
                              adults: parsed.people?.match(/(\d+)大/)?.[1] || '2',
                              children: parsed.people?.match(/(\d+)小/)?.[1] || '0',
                              notes: parsed.notes
                            });
                            setEditingCustomerOrderId(order.id);
                          }} className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-amber-600 transition-all p-1 shrink-0" title="編輯客戶資訊">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        )}
                      </div>
                        <div className="text-sm text-stone-500 font-mono mt-1 flex flex-col gap-1">
                          <div className="flex items-center gap-4">
                            <a href={`tel:${order.customer_phone}`} className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors" title="撥打電話">
                              <span className="opacity-70">📞</span> {order.customer_phone}
                            </a>
                            {parsed.people && (
                              <span className="flex items-center gap-1.5 whitespace-nowrap" title="入住人數">
                                <span className="opacity-70">👥</span> {parsed.people.replace(/[\n\r]+/g, ' ')}
                              </span>
                            )}
                          </div>
                          {parsed.email && (
                            <a href={`mailto:${parsed.email}`} className="flex items-center gap-1.5 w-full max-w-[220px] hover:text-emerald-600 transition-colors group/email" title={`寄信給 ${parsed.email}`}>
                              <span className="opacity-70 shrink-0">✉️</span> 
                              <span className="truncate">{parsed.email}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="bg-stone-50 rounded-lg p-3 text-sm space-y-1.5 border border-stone-100">
                      <div className="flex justify-between">
                        <span className="text-stone-500">入住日期</span>
                        <span className="font-bold text-stone-700">{order.check_in_date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">退營日期</span>
                        <span className="font-bold text-stone-700">{order.check_out_date}</span>
                      </div>
                      <div className="flex justify-between border-t border-stone-200/60 pt-1.5 mt-1.5">
                        <span className="text-stone-500">車牌號碼</span>
                        <span className={`font-mono ${order.license_plate ? 'text-stone-700' : 'text-stone-400 italic'}`}>{order.license_plate || '無'}</span>
                      </div>
                    </div>

                    {order.payment_method === 'bank_transfer' && order.virtual_account && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-col gap-1.5 mt-2 shadow-sm">
                        <div className="text-amber-800 font-bold text-xs flex items-center gap-1.5">
                          <span>🏦</span> 虛擬帳號匯款
                        </div>
                        <div className="text-amber-700 text-xs">
                          台新銀行 (812)<br/>
                          <span className="font-black text-[15px] text-emerald-700 tracking-widest bg-white px-2 py-0.5 rounded border border-amber-200 mt-1 inline-block">{order.virtual_account}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 項目與金額 */}
                  <div className="w-full md:w-1/2 flex flex-col justify-between">
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-stone-100">
                        <h4 className="font-bold text-sm text-stone-800 tracking-wide">預訂明細</h4>
                        {adminRole !== 'viewer' && order.status !== 'cancelled' && (
                          <button onClick={() => setEditingOrderItemsOrder(order)} className="text-xs flex items-center gap-1 text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded transition-colors font-medium border border-indigo-200 shadow-sm opacity-100 md:opacity-0 md:group-hover:opacity-100">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                            修改明細
                          </button>
                        )}
                      </div>
                      <ul className="space-y-1.5">
                        {order.nf_order_items?.map(item => (
                          <li key={item.id} className="text-sm flex justify-between items-start">
                            <span className="text-stone-700 line-clamp-1">{item.nf_items?.name}</span>
                            <span className="text-stone-500 font-mono ml-2 shrink-0">x {item.quantity}</span>
                          </li>
                        ))}
                      </ul>
                      {adminRole !== 'viewer' && (
                        replyingToOrderId === order.id ? (
                          <div className="mt-2 p-2 bg-stone-50 rounded border border-stone-300 shadow-inner" onClick={e => e.stopPropagation()}>
                            <div className="text-xs text-stone-600 mb-2 whitespace-pre-wrap max-h-32 overflow-y-auto">💬 客人備註紀錄：<br/>{parsed.notes || <span className="opacity-50 italic">無</span>}</div>
                            <textarea 
                              className="w-full text-xs p-2 border border-stone-300 rounded focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-y min-h-[60px] bg-white"
                              placeholder="輸入要回覆給客人的內容..."
                              value={replyText}
                              onChange={e => setReplyText(e.target.value)}
                              autoFocus
                            />
                            <div className="flex justify-end gap-1 mt-1">
                              <button className="text-[11px] px-2 py-1 bg-stone-200 rounded text-stone-600 hover:bg-stone-300 transition-colors font-bold" onClick={(e) => { e.stopPropagation(); setReplyingToOrderId(null); }}>取消</button>
                              <button className="text-[11px] px-3 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors font-bold shadow-sm disabled:opacity-50" disabled={isSubmittingReply || !replyText.trim()} onClick={(e) => { e.stopPropagation(); submitReply(order.id as unknown as number, order.notes); }}>
                                {isSubmittingReply ? '送出中...' : '送出回覆'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 p-2 bg-stone-100/50 hover:bg-stone-100 rounded text-xs text-stone-600 border border-stone-200 cursor-pointer transition-colors group/note relative flex flex-col justify-center min-h-[36px]" onClick={() => { setReplyingToOrderId(order.id as unknown as number); setReplyText(''); }}>
                            {!parsed.notes ? (
                              <div className="flex items-center justify-center gap-1 opacity-60 group-hover/note:opacity-100 font-medium">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>
                                新增店家回覆
                              </div>
                            ) : (
                              <>
                                <div className="whitespace-pre-wrap break-words leading-relaxed max-h-32 overflow-y-auto pr-16">
                                  <span className="font-bold opacity-80">💬 客人備註與對話：</span>
                                  <div className="mt-1.5 space-y-1.5">
                                    {parsed.notes.split('\n\n').map((paragraph, i) => {
                                      if (paragraph.startsWith('[店家回覆]')) {
                                        return <div key={i} className="p-1.5 bg-white rounded border border-amber-200 text-amber-800 shadow-sm font-medium">{paragraph}</div>;
                                      }
                                      if (paragraph.startsWith('[顧客補充]')) {
                                        return <div key={i} className="p-1.5 bg-emerald-50 rounded border border-emerald-200 text-emerald-800 shadow-sm font-medium">{paragraph}</div>;
                                      }
                                      return <div key={i} className={i > 0 ? "mt-1.5" : ""}>{paragraph}</div>;
                                    })}
                                  </div>
                                </div>
                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover/note:opacity-100 font-medium text-stone-500 bg-white border border-stone-200 rounded py-1 px-2 shadow-sm absolute top-2 right-2">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>
                                  回覆
                                </div>
                              </>
                            )}
                          </div>
                        )
                      )}
                      
                      {adminRole !== 'viewer' && (
                        editingAdminNoteOrderId === order.id ? (
                          <div className="mt-2" onClick={e => e.stopPropagation()}>
                            <textarea 
                              className="w-full text-xs p-2 border border-amber-300 rounded bg-amber-50 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-y min-h-[60px]"
                              placeholder="輸入僅管理員可見的備註..."
                              value={adminNoteText}
                              onChange={e => setAdminNoteText(e.target.value)}
                              autoFocus
                            />
                            <div className="flex justify-end gap-1 mt-1">
                              <button className="text-[11px] px-2 py-1 bg-amber-200/50 rounded text-amber-700 hover:bg-amber-300/50 transition-colors font-bold" onClick={(e) => { e.stopPropagation(); setEditingAdminNoteOrderId(null); }}>取消</button>
                              <button className="text-[11px] px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors font-bold shadow-sm disabled:opacity-50" disabled={isSubmittingReply} onClick={(e) => { e.stopPropagation(); submitAdminNote(order.id); }}>
                                {isSubmittingReply ? '儲存中...' : '儲存備註'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 p-2 bg-amber-50 hover:bg-amber-100/80 rounded text-xs text-amber-800 border border-amber-200 cursor-pointer transition-colors group/note relative" onClick={() => { setEditingAdminNoteOrderId(order.id); setAdminNoteText(order.admin_notes || ''); }}>
                            <div className="flex items-center justify-center gap-1 opacity-60 group-hover/note:opacity-100 font-medium">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                              {order.admin_notes ? '編輯營主備註' : '新增營主備註'}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                    <div className="mt-auto">
                      <div className="text-right">
                        {order.discount_code && (
                          <div className="text-xs text-emerald-600 font-bold mb-1">
                            🎟️ {order.discount_code} (-NT$ {order.discount_amount?.toLocaleString()})
                          </div>
                        )}
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-stone-500 whitespace-nowrap">總金額</span>
                            <span className={`text-xl font-bold tracking-tight ${order.status === 'cancelled' ? 'text-stone-400 line-through' : 'text-stone-700'}`}>
                              NT$ {order.total_amount?.toLocaleString()}
                            </span>
                            {order.status !== 'cancelled' && (
                              <button onClick={() => openFinancialsModal(order)} className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity text-stone-400 hover:text-amber-600" title="微調訂單金額">
                                ✏️
                              </button>
                            )}
                          </div>
                          {/* 線上付款（信用卡 + 匯款，從 payment_logs 算） */}
                          {getOrderOnlineAmount(order.id) > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-indigo-600">💳 線上付款</span>
                                <span className="text-sm font-bold text-indigo-600 tracking-tight">
                                  - NT$ {getOrderOnlineAmount(order.id).toLocaleString()}
                                </span>
                              </div>
                          )}
                          {/* 現場收款（從 payment_logs 算） */}
                          {getOrderOnsiteAmount(order.id) > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-emerald-600">💵 現場收款</span>
                                <span className="text-sm font-bold text-emerald-600 tracking-tight">
                                  - NT$ {getOrderOnsiteAmount(order.id).toLocaleString()}
                                </span>
                              </div>
                            )}


                            {(() => {
                              const deposit = order.deposit_amount || 0;

                              if (deposit > order.total_amount) {
                                return (
                                  <div className="flex justify-end items-end gap-2 mt-1 pt-1 border-t border-stone-200 border-dashed">
                                    <span className="text-xs text-rose-500 font-bold mb-1">🚨 需退款</span>
                                    <span className="text-2xl font-black tracking-tight text-rose-600">
                                      NT$ {(deposit - order.total_amount).toLocaleString()}
                                    </span>
                                  </div>
                                );
                              }

                              if (deposit >= order.total_amount) {
                                return (
                                  <div className="flex justify-end items-end gap-2 mt-1 pt-1 border-t border-stone-200 border-dashed">
                                    <span className="text-xs text-emerald-600 font-bold mb-1">✅ 已結清</span>
                                    <span className="text-2xl font-black tracking-tight text-emerald-600">
                                      NT$ {deposit.toLocaleString()}
                                    </span>
                                  </div>
                                );
                              }

                              return (
                                <div className="flex justify-end items-end gap-2 mt-1 pt-1 border-t border-stone-200 border-dashed">
                                  <span className="text-xs text-rose-500 font-bold mb-1">待收</span>
                                  <span className="text-2xl font-black tracking-tight text-rose-600">
                                    NT$ {Math.max(0, order.total_amount - deposit).toLocaleString()}
                                  </span>
                                </div>
                              );
                            })()}
                          {(!order.deposit_amount || order.deposit_amount === 0) && order.status !== 'cancelled' && (
                            <div className="text-2xl font-bold tracking-tight mt-1 text-emerald-600">
                              NT$ {order.total_amount?.toLocaleString()}
                            </div>
                          )}
                          {order.status === 'cancelled' && (
                            <div className="text-2xl font-bold tracking-tight mt-1 text-stone-400">
                              已取消
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>


                {/* 操作按鈕 */}
                {adminRole !== 'viewer' && (
                  <div className="px-5 py-3 bg-stone-50 border-t border-stone-100 flex flex-wrap items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    {/* 左邊：刪除（僅 dr.mr.openken） */}
                    {adminEmail === 'dr.mr.openken@gmail.com' && (
                      <button onClick={() => deleteOrder(order.id)} className="px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded-md transition-colors">
                        刪除
                      </button>
                    )}
                    {/* 左邊：取消訂單 */}
                    {order.status !== 'cancelled' && (
                      <button onClick={() => updateOrderStatus(order.id, 'cancelled')} className="px-3 py-1.5 text-xs font-bold text-stone-600 bg-white hover:bg-stone-100 border border-stone-200 rounded-md transition-colors">
                        取消訂單
                      </button>
                    )}
                    {/* 右邊區塊（ml-auto 推到底） */}
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      {order.status === 'paid' && (
                        <button onClick={() => updateOrderStatus(order.id, 'checked_in')} className="whitespace-nowrap px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors shadow-sm">
                          ✅ 標記已報到
                        </button>
                      )}
                      {/* 線上付款（信用卡／匯款） */}
                      {order.status !== 'cancelled' && order.status !== 'paid' && order.status !== 'checked_in' && (
                        <button
                          onClick={() => { setOnlinePaymentOrderId(order.id); setOnlinePaymentAmount(''); setOnlinePaymentType('bank_transfer'); }}
                          className="whitespace-nowrap px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors"
                        >
                          💳 線上付款
                        </button>
                      )}
                      {/* 現場收款 */}
                      {order.status !== 'cancelled' && order.status !== 'paid' && order.status !== 'checked_in' && (
                        <button onClick={() => { setOnsitePaymentOrderId(order.id); setOnsiteAmount(''); setOnsiteNotes(''); }} className="whitespace-nowrap px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors">
                          💵 現場收款
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
      </div>

      {/* 線上付款 Modal */}
      {onlinePaymentOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm" onClick={() => setOnlinePaymentOrderId(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <span className="text-xl">💳</span>
              <h3 className="font-black text-stone-800">線上付款</h3>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-500 mb-1.5">付款方式</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setOnlinePaymentType('credit_card')}
                  className={`flex-1 py-2.5 text-sm font-bold rounded-xl border-2 transition-all ${onlinePaymentType === 'credit_card' ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}
                >
                  💳 信用卡
                </button>
                <button
                  onClick={() => setOnlinePaymentType('bank_transfer')}
                  className={`flex-1 py-2.5 text-sm font-bold rounded-xl border-2 transition-all ${onlinePaymentType === 'bank_transfer' ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}
                >
                  🏦 匯款
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-500 mb-1.5">收款金額 <span className="text-rose-500">*</span></label>
              <input
                type="number"
                value={onlinePaymentAmount}
                onChange={e => setOnlinePaymentAmount(e.target.value)}
                placeholder="正數收款、負數沖正"
                className="w-full border border-stone-200 rounded-xl p-3 text-lg font-black text-indigo-700 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <p className="text-[11px] text-stone-400 mt-1">💡 正數＝收款，負數＝沖正退款</p>
            </div>

            <div className="bg-stone-50 rounded-xl p-3 text-xs text-stone-500 space-y-1">
              <p>👤 經手人：<span className="font-bold text-stone-700">{adminEmail || '—'}</span></p>
              <p>🕐 時間：<span className="font-bold text-stone-700">{new Date().toLocaleString('zh-TW')}</span></p>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setOnlinePaymentOrderId(null)} disabled={isSubmittingOnline} className="flex-1 py-3 text-sm font-bold text-stone-500 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors">
                取消
              </button>
              <button onClick={submitOnlinePayment} disabled={isSubmittingOnline || !onlinePaymentAmount || parseInt(onlinePaymentAmount) === 0} className="flex-1 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors">
                {isSubmittingOnline ? '送出中...' : '確認收款'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 現場收款 Modal */}
      {onsitePaymentOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm" onClick={() => setOnsitePaymentOrderId(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <span className="text-xl">💵</span>
              <h3 className="font-black text-stone-800">現場收款</h3>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-500 mb-1.5">收款金額 <span className="text-rose-500">*</span></label>
              <input
                type="number"
                value={onsiteAmount}
                onChange={e => setOnsiteAmount(e.target.value)}
                placeholder="正數收款、負數沖正"
                className="w-full border border-stone-200 rounded-xl p-3 text-lg font-black text-emerald-700 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <p className="text-[11px] text-stone-400 mt-1">💡 正數＝收款，負數＝沖正退款</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-500 mb-1.5">備註（選填）</label>
              <input
                type="text"
                value={onsiteNotes}
                onChange={e => setOnsiteNotes(e.target.value)}
                placeholder="現金 / 街口 / 退款原因"
                className="w-full border border-stone-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div className="bg-stone-50 rounded-xl p-3 text-xs text-stone-500 space-y-1">
              <p>👤 經手人：<span className="font-bold text-stone-700">{adminEmail || '—'}</span></p>
              <p>🕐 時間：<span className="font-bold text-stone-700">{new Date().toLocaleString('zh-TW')}</span></p>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setOnsitePaymentOrderId(null)} disabled={isSubmittingOnsite} className="flex-1 py-3 text-sm font-bold text-stone-500 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors">
                取消
              </button>
              <button onClick={submitOnsitePayment} disabled={isSubmittingOnsite || !onsiteAmount || parseInt(onsiteAmount) <= 0} className="flex-1 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors">
                {isSubmittingOnsite ? '送出中...' : '確認收款'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯訂單金額 Modal */}
      {editingFinancialsId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden border border-stone-200">
            <div className="p-5 border-b border-stone-100 flex justify-between items-center bg-stone-50">
              <h3 className="font-bold text-stone-800 flex items-center gap-2">
                <span>💰</span> 訂單金額微調
              </h3>
              <button onClick={() => setEditingFinancialsId(null)} className="text-stone-400 hover:text-rose-500 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-stone-600 mb-1.5">訂單金額</label>
                <div className="flex items-center gap-2 bg-stone-50 p-2 rounded-lg border border-stone-200">
                  <span className="text-stone-500">NT$</span>
                  <input 
                    type="number" 
                    min="0"
                    value={financialsForm.total_amount}
                    onChange={e => setFinancialsForm({...financialsForm, total_amount: e.target.value})}
                    className="flex-1 bg-transparent border-none p-0 text-right font-bold focus:ring-0 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-600 mb-1.5">已收金額 <span className="text-[11px] font-normal text-stone-400">（自動計算，不可修改）</span></label>
                <div className="flex items-center gap-2 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                  <span className="text-emerald-600">NT$</span>
                  <span className="flex-1 text-right font-bold text-emerald-700 text-lg">
                    {(parseInt(financialsForm.deposit_amount) || 0).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="pt-3 border-t border-stone-100 flex justify-between items-end">
                <span className="text-sm font-bold text-stone-500">
                  {parseInt(financialsForm.deposit_amount) > 0 ? '試算尾款' : '總金額'}
                </span>
                <span className="text-xl font-black text-amber-600">
                  NT$ {Math.max(0, (parseInt(financialsForm.total_amount) || 0) - (parseInt(financialsForm.deposit_amount) || 0)).toLocaleString()}
                </span>
              </div>
              <div className="text-[10px] text-stone-400 text-center leading-relaxed bg-stone-50 p-2 rounded">
                💡 儲存後，系統會根據訂單金額與 payment_logs 自動計算已收金額
              </div>
            </div>
            <div className="p-4 border-t border-stone-100 flex justify-end gap-2 bg-stone-50">
              <button onClick={() => setEditingFinancialsId(null)} className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-200 rounded-lg font-bold transition-colors">
                取消
              </button>
              <button onClick={saveFinancials} className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold shadow-sm transition-colors">
                儲存變更
              </button>
            </div>
          </div>
        </div>
      )}

      <OrderModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchOrders} 
      />

      <EditOrderItemsModal
        isOpen={!!editingOrderItemsOrder}
        onClose={() => setEditingOrderItemsOrder(null)}
        onSuccess={() => {
          fetchOrders();
          setEditingOrderItemsOrder(null);
        }}
        order={editingOrderItemsOrder}
      />

      {/* 編輯客戶資訊 Modal */}
      {editingCustomerOrderId && (() => {
        const order = orders.find(o => o.id === editingCustomerOrderId);
        if (!order) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm" onClick={() => setEditingCustomerOrderId(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-stone-200 overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-stone-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">✏️</span>
                  <h3 className="text-xl font-bold text-stone-800">編輯客戶資訊</h3>
                </div>
                <button onClick={() => setEditingCustomerOrderId(null)} className="text-stone-400 hover:text-rose-500 transition-colors p-2 rounded-full hover:bg-rose-50">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-bold text-stone-700 mb-1">姓名 *</label>
                    <input type="text" value={customerEditForm.customer_name} onChange={e => setCustomerEditForm({...customerEditForm, customer_name: e.target.value})} className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" placeholder="客戶姓名" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-700 mb-1">電話 *</label>
                    <input type="tel" inputMode="tel" pattern="[0-9+]*" value={customerEditForm.customer_phone} onChange={e => {
                      const val = e.target.value.replace(/[^0-9+]/g, '');
                      setCustomerEditForm({...customerEditForm, customer_phone: val});
                    }} className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" placeholder="0912345678" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-700 mb-1">Email</label>
                    <input type="email" value={customerEditForm.email} onChange={e => setCustomerEditForm({...customerEditForm, email: e.target.value})} className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" placeholder="test@example.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-700 mb-1">大人</label>
                    <input type="number" min="1" max="20" value={customerEditForm.adults} onChange={e => setCustomerEditForm({...customerEditForm, adults: e.target.value})} className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-700 mb-1">小孩</label>
                    <input type="number" min="0" max="20" value={customerEditForm.children} onChange={e => setCustomerEditForm({...customerEditForm, children: e.target.value})} className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-bold text-stone-700 mb-1">備註</label>
                    <textarea value={customerEditForm.notes} onChange={e => setCustomerEditForm({...customerEditForm, notes: e.target.value})} className="w-full border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-y min-h-[60px]" placeholder="其他備註..." />
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-stone-100 flex justify-end gap-2 bg-stone-50">
                <button onClick={() => setEditingCustomerOrderId(null)} className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-200 rounded-lg font-bold transition-colors">取消</button>
                <button onClick={async () => {
                  if (!customerEditForm.customer_name.trim() || !customerEditForm.customer_phone.trim()) {
                    alert('姓名與電話為必填');
                    return;
                  }
                  const newNotes = `[Email: ${customerEditForm.email}] [人數: ${customerEditForm.adults}大 ${customerEditForm.children}小] ${customerEditForm.notes}`.trim();
                  const { error } = await supabase.from('nf_orders').update({
                    customer_name: customerEditForm.customer_name.trim(),
                    customer_phone: customerEditForm.customer_phone.trim(),
                    notes: newNotes
                  }).eq('id', editingCustomerOrderId);
                  if (error) {
                    alert('更新失敗: ' + error.message);
                  } else {
                    setEditingCustomerOrderId(null);
                    fetchOrders();
                  }
                }} className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold shadow-sm transition-colors">儲存變更</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
