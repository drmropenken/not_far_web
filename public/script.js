// ===== DOM 載入完成後執行 =====
document.addEventListener('DOMContentLoaded', function() {
  initNavbar();
  initScrollAnimations();
  initFaq();
  initSmoothScroll();
  initGalleryLightbox();
  initBookingForm();
  initContactForm();
  initCounter();
});

// ===== Navbar 功能 =====
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.querySelector('.nav-links');
  
  // 滾動效果
  window.addEventListener('scroll', function() {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
  
  // 漢堡選單
  if (hamburger) {
    hamburger.addEventListener('click', function() {
      navLinks.classList.toggle('open');
      hamburger.classList.toggle('active');
    });
  }
  
  // 點擊連結後關閉選單
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', function() {
      navLinks.classList.remove('open');
      hamburger.classList.remove('active');
    });
  });
  
  // 當前頁面高亮
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage) {
      link.classList.add('active');
    }
  });
}

// ===== 滾動動畫 =====
function initScrollAnimations() {
  const fadeElements = document.querySelectorAll('.fade-in');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });
  
  fadeElements.forEach(el => observer.observe(el));
}

// ===== FAQ 功能 =====
function initFaq() {
  document.querySelectorAll('.faq-question').forEach(question => {
    question.addEventListener('click', function() {
      const item = this.parentElement;
      const isActive = item.classList.contains('active');
      
      // 關閉其他 FAQ
      document.querySelectorAll('.faq-item').forEach(other => {
        other.classList.remove('active');
      });
      
      // 切換當前
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
}

// ===== 平滑滾動 =====
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
}

// ===== 圖庫燈箱 =====
function initGalleryLightbox() {
  const galleryItems = document.querySelectorAll('.gallery-item');
  
  galleryItems.forEach(item => {
    item.addEventListener('click', function() {
      const img = this.querySelector('img');
      const src = img.getAttribute('src');
      const alt = img.getAttribute('alt');
      
      const lightbox = document.createElement('div');
      lightbox.className = 'lightbox';
      lightbox.innerHTML = `
        <div class="lightbox-content">
          <span class="lightbox-close">&times;</span>
          <img src="${src}" alt="${alt}">
          <p class="lightbox-caption">${alt}</p>
        </div>
      `;
      
      document.body.appendChild(lightbox);
      document.body.style.overflow = 'hidden';
      
      // 動畫
      setTimeout(() => lightbox.classList.add('active'), 10);
      
      // 關閉
      lightbox.addEventListener('click', function(e) {
        if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
          lightbox.classList.remove('active');
          setTimeout(() => {
            document.body.removeChild(lightbox);
            document.body.style.overflow = '';
          }, 300);
        }
      });
    });
  });
}

// ===== 預訂表單 =====
function initBookingForm() {
  const bookingForm = document.getElementById('bookingForm');
  if (!bookingForm) return;

  const phoneRegex = /^09\d{8}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const checkinInput = bookingForm.querySelector('#checkin');
  const checkoutInput = bookingForm.querySelector('#checkout');
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  if (checkinInput) {
    checkinInput.min = minDate;
    checkinInput.addEventListener('change', () => {
      if (checkoutInput) {
        checkoutInput.min = checkinInput.value || minDate;
        if (checkoutInput.value && checkoutInput.value <= checkinInput.value) {
          checkoutInput.value = '';
        }
      }
    });
  }

  if (checkoutInput) {
    checkoutInput.min = minDate;
  }

  bookingForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    let isValid = true;
    const requiredFields = this.querySelectorAll('[required]');
    requiredFields.forEach(field => {
      if (!field.value.trim()) {
        field.style.borderColor = '#e74c3c';
        isValid = false;
      } else {
        field.style.borderColor = '';
      }
    });

    const phoneField = this.querySelector('#phone');
    const emailField = this.querySelector('#email');
    if (phoneField && !phoneRegex.test(phoneField.value.trim())) {
      phoneField.style.borderColor = '#e74c3c';
      showToast('請輸入正確手機格式：09xxxxxxxx', 'error');
      isValid = false;
    }

    if (emailField && !emailRegex.test(emailField.value.trim())) {
      emailField.style.borderColor = '#e74c3c';
      showToast('請輸入正確 Email 格式', 'error');
      isValid = false;
    }

    if (!isValid) {
      return;
    }

    if (checkinInput && checkoutInput && checkinInput.value && checkoutInput.value) {
      if (checkoutInput.value <= checkinInput.value) {
        checkoutInput.style.borderColor = '#e74c3c';
        showToast('退房日期必須晚於入住日期。', 'error');
        return;
      }
    }

    const formData = new FormData(this);
    const payload = {};
    formData.forEach((value, key) => {
      payload[key] = value;
    });

    showToast('正在建立訂單，請稍候...', 'success');

    try {
      const response = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        showToast(result?.error || '預訂失敗，請稍後再試。', 'error');
        return;
      }

      if (!result?.actionUrl || !result?.params) {
        showToast('伺服器回傳格式錯誤，請聯絡管理員。', 'error');
        return;
      }

      const paymentForm = document.createElement('form');
      paymentForm.method = 'POST';
      paymentForm.action = result.actionUrl;
      paymentForm.style.display = 'none';

      Object.entries(result.params).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(value);
        paymentForm.appendChild(input);
      });

      document.body.appendChild(paymentForm);
      paymentForm.submit();
    } catch (error) {
      console.error(error);
      showToast('網路發生錯誤，請稍後再試。', 'error');
    }
  });

  bookingForm.querySelectorAll('[required]').forEach(field => {
    field.addEventListener('input', function() {
      if (this.value.trim()) {
        this.style.borderColor = '';
      }
    });
  });
}

// ===== 聯絡表單 =====
function initContactForm() {
  const contactForm = document.getElementById('contactForm');
  if (!contactForm) return;

  contactForm.addEventListener('submit', async function(e) {
    e.preventDefault(); // 絕對阻止傳統表單提交

    // 直接構建 JSON 對象，不使用 FormData
    const payload = {
      name: document.querySelector('input[name="name"]')?.value || '',
      phone: document.querySelector('input[name="phone"]')?.value || '',
      email: document.querySelector('input[name="email"]')?.value || '',
      subject: document.querySelector('select[name="subject"]')?.value || '',
      message: document.querySelector('textarea[name="message"]')?.value || ''
    };

    console.log('即將發送的資料:', payload); // 除錯用

    // 強制設定 Content-Type 為 JSON
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok) {
        alert('您的訊息已成功送出！');
        this.reset();
      } else {
        alert('錯誤：' + (result.error || '發送失敗'));
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('網路異常，請稍後再試。');
    }
  });
}

// ===== Toast 通知 =====
function showToast(message, type = 'success') {
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    document.body.removeChild(existingToast);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span>
      <p>${message}</p>
    </div>
  `;
  
  document.body.appendChild(toast);
  
  // 動畫
  setTimeout(() => toast.classList.add('active'), 10);
  
  // 自動消失
  setTimeout(() => {
    toast.classList.remove('active');
    setTimeout(() => {
      if (toast.parentNode) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, 4000);
}

// ===== 數字動畫 =====
function initCounter() {
  const counters = document.querySelectorAll('.stat-item .number');
  if (!counters.length) return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = parseInt(entry.target.getAttribute('data-target'));
        animateCounter(entry.target, target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  
  counters.forEach(counter => observer.observe(counter));
}

function animateCounter(element, target) {
  let current = 0;
  const increment = target / 60;
  const duration = 2000;
  const stepTime = duration / 60;
  
  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      element.textContent = target.toLocaleString() + '+';
      clearInterval(timer);
    } else {
      element.textContent = Math.floor(current).toLocaleString();
    }
  }, stepTime);
}

// ===== 添加燈箱樣式 =====
const lightboxStyles = `
.lightbox {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.lightbox.active {
  opacity: 1;
}

.lightbox-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
}

.lightbox-content img {
  max-width: 100%;
  max-height: 80vh;
  object-fit: contain;
  border-radius: 8px;
}

.lightbox-close {
  position: absolute;
  top: -40px;
  right: 0;
  color: white;
  font-size: 2rem;
  cursor: pointer;
  transition: transform 0.3s ease;
}

.lightbox-close:hover {
  transform: rotate(90deg);
}

.lightbox-caption {
  color: white;
  text-align: center;
  margin-top: 12px;
  font-size: 1rem;
}

.toast {
  position: fixed;
  top: 100px;
  right: 20px;
  z-index: 10000;
  padding: 16px 24px;
  border-radius: 12px;
  color: white;
  font-weight: 500;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  transform: translateX(120%);
  transition: transform 0.3s ease;
  max-width: 400px;
}

.toast.active {
  transform: translateX(0);
}

.toast-success {
  background: linear-gradient(135deg, #2d6a4f, #40916c);
}

.toast-error {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toast-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  font-size: 0.9rem;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .toast {
    left: 16px;
    right: 16px;
    max-width: none;
  }
}
`;

const styleSheet = document.createElement('style');
styleSheet.textContent = lightboxStyles;
document.head.appendChild(styleSheet);