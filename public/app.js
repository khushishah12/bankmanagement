/**
 * Bank Management System - Vue.js 3 Application
 *
 * Uses Vue 3 Options API: data, computed, methods.
 * Integrates Fetch API, LocalStorage, HTML5 Drag-and-Drop, and Geolocation API.
 *
 * REFERENCE LINKS:
 * Vue.js 3:        https://vuejs.org/guide/introduction.html
 * Vue Options API: https://vuejs.org/api/options-state.html
 * Vue Lifecycle:   https://vuejs.org/guide/essentials/lifecycle.html
 * Fetch API:       https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
 * LocalStorage:    https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
 * JavaScript:      https://developer.mozilla.org/en-US/docs/Web/JavaScript
 * REST API:        https://developer.mozilla.org/en-US/docs/Glossary/REST
 * Drag and Drop:   https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API
 * Geolocation:     https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
 * Intl DateFormat: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
 * JSON:            https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON
 * Array Methods:   https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array
 */

const { createApp } = Vue;

// Vue createApp reference:
// https://vuejs.org/api/application.html#createapp

createApp({
  // data() stores reactive application state.
  // Reference: https://vuejs.org/api/options-state.html#data
  data() {
    return {
      // Active section in UI: 'dashboard', 'customers', 'accounts', 'transactions', 'organizer', 'geolocation'
      activeSection: 'dashboard',

      // Data collections loaded from MongoDB via Node.js REST API
      // Fetch API: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
      customers: [],
      accounts: [],
      transactions: [],

      // Dashboard statistics loaded from /api/dashboard
      dashboard: {
        totalCustomers: 0,
        totalAccounts: 0,
        totalTransactions: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        recentTransactions: []
      },

      // Form model for Customer Registration / Edit
      customerForm: {
        customerId: '',
        name: '',
        email: '',
        phone: '',
        address: '',
        dateOfBirth: '',
        gender: 'Male'
      },
      isEditingCustomer: false,

      // Form model for Account Creation
      accountForm: {
        customerId: '',
        accountType: 'Savings',
        initialDeposit: 500,
        batch: 'Batch A'
      },

      // Form model for Deposit / Withdrawal
      transactionForm: {
        accountNumber: '',
        type: 'Deposit',
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0]
      },

      // Form model for Money Transfer
      transferForm: {
        fromAccount: '',
        toAccount: '',
        amount: '',
        description: ''
      },

      // Filter and Search states
      customerSearch: '',
      accountSearch: '',
      accountTypeFilter: 'all',
      accountStatusFilter: 'all',
      accountBatchFilter: 'all',
      transactionAccountSearch: '',
      transactionTypeFilter: 'all',
      transactionDateFilter: '',

      // LocalStorage UI Preferences
      // Reference: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
      uiPreferences: {
        dashboardView: 'grid',       // 'grid' or 'compact'
        uppercaseDisplay: false      // Uppercase demonstration toggle
      },

      // HTML5 Geolocation State
      // Reference: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
      geoData: {
        latitude: null,
        longitude: null,
        accuracy: null,
        timestamp: null,
        error: null,
        loading: false
      },

      // HTML5 Drag-and-Drop state
      // Reference: https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API
      draggedAccount: null,
      dragOverZone: null,

      // System notification alert
      alert: {
        show: false,
        message: '',
        type: 'alert-success'
      },

      // Loading spinner state
      isLoading: false
    };
  },

  // Computed properties automatically update when their reactive dependencies change.
  // Reference: https://vuejs.org/guide/essentials/computed.html
  computed: {
    // 1. Filtered Customers: search by Name or Customer ID
    // Array filter: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
    // String includes: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes
    filteredCustomers() {
      const q = this.customerSearch.trim().toLowerCase();
      if (!q) return this.customers;
      return this.customers.filter(c => 
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.customerId && c.customerId.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
      );
    },

    // 2. Filtered Bank Accounts: search by Account No, filter by Type, Status, and Batch
    filteredAccounts() {
      return this.accounts.filter(acc => {
        const matchesQuery = !this.accountSearch.trim() || 
          acc.accountNumber.toLowerCase().includes(this.accountSearch.trim().toLowerCase()) ||
          (acc.customerName && acc.customerName.toLowerCase().includes(this.accountSearch.trim().toLowerCase()));

        const matchesType = this.accountTypeFilter === 'all' || acc.accountType === this.accountTypeFilter;
        const matchesStatus = this.accountStatusFilter === 'all' || acc.status === this.accountStatusFilter;
        const matchesBatch = this.accountBatchFilter === 'all' || acc.batch === this.accountBatchFilter;

        return matchesQuery && matchesType && matchesStatus && matchesBatch;
      });
    },

    // 3. Filtered Transactions: search by Account No, filter by Type and Date
    filteredTransactions() {
      return this.transactions.filter(txn => {
        const matchesAcc = !this.transactionAccountSearch.trim() || 
          txn.accountNumber.toLowerCase().includes(this.transactionAccountSearch.trim().toLowerCase()) ||
          (txn.transactionId && txn.transactionId.toLowerCase().includes(this.transactionAccountSearch.trim().toLowerCase()));

        const matchesType = this.transactionTypeFilter === 'all' || txn.type === this.transactionTypeFilter;

        let matchesDate = true;
        if (this.transactionDateFilter) {
          // Date conversion reference:
          // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date
          const txnDate = new Date(txn.createdAt).toISOString().split('T')[0];
          matchesDate = txnDate === this.transactionDateFilter;
        }

        return matchesAcc && matchesType && matchesDate;
      });
    },

    // 4. Accounts filtered for Drag-and-Drop categories
    savingsAccounts() {
      return this.accounts.filter(a => a.accountType === 'Savings');
    },
    currentAccounts() {
      return this.accounts.filter(a => a.accountType === 'Current');
    },

    // 5. Active accounts only (for deposit, withdrawal, and transfer selectors)
    activeAccounts() {
      return this.accounts.filter(a => a.status === 'Active');
    }
  },

  // Methods contain functions used by the application.
  // Reference: https://vuejs.org/api/options-state.html#methods
  methods: {
    // ==========================================
    // NOTIFICATIONS & LOCALSTORAGE PREFERENCES
    // ==========================================

    showAlert(message, isSuccess = true) {
      this.alert.message = message;
      this.alert.type = isSuccess ? 'alert-success' : 'alert-danger';
      this.alert.show = true;

      // setTimeout reference:
      // https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout
      // Auto-dismiss alert after 5 seconds
      setTimeout(() => {
        this.alert.show = false;
      }, 5000);
    },

    // Save harmless UI preferences to LocalStorage using JSON.stringify()
    // LocalStorage: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
    // JSON.stringify: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
    savePreferences() {
      try {
        const preferences = {
          dashboardView: this.uiPreferences.dashboardView,
          uppercaseDisplay: this.uiPreferences.uppercaseDisplay,
          activeSection: this.activeSection,
          accountBatchFilter: this.accountBatchFilter
        };
        localStorage.setItem('bank_ui_preferences', JSON.stringify(preferences));
      } catch (e) {
        console.warn('Could not save to LocalStorage:', e);
      }
    },

    // Restore UI preferences from LocalStorage using JSON.parse()
    // JSON.parse: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse
    loadPreferences() {
      try {
        const raw = localStorage.getItem('bank_ui_preferences');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.dashboardView) this.uiPreferences.dashboardView = parsed.dashboardView;
          if (typeof parsed.uppercaseDisplay === 'boolean') this.uiPreferences.uppercaseDisplay = parsed.uppercaseDisplay;
          if (parsed.activeSection) this.activeSection = parsed.activeSection;
          if (parsed.accountBatchFilter) this.accountBatchFilter = parsed.accountBatchFilter;
        }
      } catch (e) {
        console.warn('Could not parse preferences from LocalStorage:', e);
      }
    },

    // Switch visible main navigation section
    setSection(sectionName) {
      this.activeSection = sectionName;
      this.savePreferences();
    },

    toggleDashboardView() {
      this.uiPreferences.dashboardView = this.uiPreferences.dashboardView === 'grid' ? 'compact' : 'grid';
      this.savePreferences();
    },

    toggleUppercase() {
      this.uiPreferences.uppercaseDisplay = !this.uiPreferences.uppercaseDisplay;
      this.savePreferences();
    },

    // ==========================================
    // UTILITY METHODS (FORMATTING & COLORS)
    // ==========================================

    // Date formatting method using JavaScript Intl.DateTimeFormat
    // Reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
    formatDate(dateVal) {
      if (!dateVal) return '-';
      try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return '-';
        return new Intl.DateTimeFormat('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }).format(d);
      } catch (e) {
        return '-';
      }
    },

    // Uppercase conversion method for customer names and types
    // Reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/toUpperCase
    toUpperCase(text) {
      if (!text) return '';
      return String(text).toUpperCase();
    },

    // Display formatted name honoring uppercase preference without changing MongoDB
    displayName(text) {
      if (!text) return '';
      return this.uiPreferences.uppercaseDisplay ? this.toUpperCase(text) : text;
    },

    // Conditional CSS classes for account status badges
    // Switch statement: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/switch
    getStatusClass(status) {
      switch (status) {
        case 'Active':
          return 'badge-active';
        case 'Frozen':
          return 'badge-frozen';
        case 'Closed':
          return 'badge-closed';
        default:
          return 'bg-secondary text-white';
      }
    },

    // Conditional CSS classes for transaction types
    getTransactionClass(type) {
      switch (type) {
        case 'Deposit':
          return 'badge-deposit';
        case 'Withdrawal':
          return 'badge-withdrawal';
        case 'Transfer':
          return 'badge-transfer';
        default:
          return 'bg-secondary text-white';
      }
    },

    // ==========================================
    // DATA FETCHING (FETCH API INTEGRATION)
    // ==========================================

    // Promise.all runs multiple asynchronous operations concurrently.
    // Reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all
    async refreshAll() {
      this.isLoading = true;
      try {
        await Promise.all([
          this.loadDashboard(),
          this.loadCustomers(),
          this.loadAccounts(),
          this.loadTransactions()
        ]);
      } catch (err) {
        console.error('Error refreshing data:', err);
      } finally {
        this.isLoading = false;
      }
    },

    // Fetch API: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
    // Response.json(): https://developer.mozilla.org/en-US/docs/Web/API/Response/json
    async loadDashboard() {
      try {
        const res = await fetch('/api/dashboard');
        if (!res.ok) throw new Error('Failed to load dashboard metrics');
        this.dashboard = await res.json();
      } catch (err) {
        console.error('loadDashboard error:', err);
      }
    },

    async loadCustomers() {
      try {
        const res = await fetch('/api/customers');
        if (!res.ok) throw new Error('Failed to fetch customers');
        this.customers = await res.json();
      } catch (err) {
        this.showAlert(err.message, false);
      }
    },

    async loadAccounts() {
      try {
        const res = await fetch('/api/accounts');
        if (!res.ok) throw new Error('Failed to fetch accounts');
        this.accounts = await res.json();
      } catch (err) {
        this.showAlert(err.message, false);
      }
    },

    async loadTransactions() {
      try {
        const res = await fetch('/api/transactions');
        if (!res.ok) throw new Error('Failed to fetch transactions');
        this.transactions = await res.json();
      } catch (err) {
        this.showAlert(err.message, false);
      }
    },

    // ==========================================
    // CUSTOMER MANAGEMENT ACTIONS
    // ==========================================

    // HTTP methods reference:
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
    // JSON request body:
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
    async saveCustomer() {
      try {
        if (this.isEditingCustomer) {
          // Update existing customer using PUT
          const res = await fetch(`/api/customers/${this.customerForm.customerId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.customerForm)
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to update customer');

          this.showAlert(`Customer ${this.customerForm.name} updated successfully!`);
          this.cancelEditCustomer();
        } else {
          // Register new customer using POST
          const res = await fetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.customerForm)
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to register customer');

          this.showAlert(`Customer ${data.name} registered with ID: ${data.customerId}!`);
          this.resetCustomerForm();
        }

        await this.refreshAll();
      } catch (err) {
        this.showAlert(err.message, false);
      }
    },

    // Object assignment and editing reference:
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object
    editCustomer(customer) {
      this.isEditingCustomer = true;
      this.customerForm = {
        customerId: customer.customerId,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address || '',
        dateOfBirth: customer.dateOfBirth,
        gender: customer.gender || 'Male'
      };

      // Scroll to registration form
      // Reference: https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollTo
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    cancelEditCustomer() {
      this.isEditingCustomer = false;
      this.resetCustomerForm();
    },

    resetCustomerForm() {
      this.customerForm = {
        customerId: '',
        name: '',
        email: '',
        phone: '',
        address: '',
        dateOfBirth: '',
        gender: 'Male'
      };
    },

    // confirm() displays a browser confirmation dialog.
    // Reference: https://developer.mozilla.org/en-US/docs/Web/API/Window/confirm
    async deleteCustomer(customerId) {
      if (!confirm(`Are you sure you want to delete customer ${customerId}?`)) return;

      try {
        const res = await fetch(`/api/customers/${customerId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete customer');

        this.showAlert(data.message || 'Customer deleted successfully');
        await this.refreshAll();
      } catch (err) {
        this.showAlert(err.message, false);
      }
    },

    // ==========================================
    // BANK ACCOUNT MANAGEMENT ACTIONS
    // ==========================================

    async createAccount() {
      try {
        const res = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.accountForm)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create account');

        this.showAlert(`Bank Account ${data.accountNumber} created for customer ${data.customerName}!`);
        this.accountForm = {
          customerId: '',
          accountType: 'Savings',
          initialDeposit: 500,
          batch: 'Batch A'
        };
        await this.refreshAll();
      } catch (err) {
        this.showAlert(err.message, false);
      }
    },

    async updateAccountStatus(accountNumber, newStatus) {
      try {
        const res = await fetch(`/api/accounts/${accountNumber}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update account status');

        this.showAlert(`Account ${accountNumber} status changed to ${newStatus}`);
        await this.refreshAll();
      } catch (err) {
        this.showAlert(err.message, false);
      }
    },

    // Batch Allocation method - updates MongoDB via PUT /api/accounts/:id/batch
    async updateAccountBatch(accountNumber, newBatch) {
      try {
        const res = await fetch(`/api/accounts/${accountNumber}/batch`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch: newBatch })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update batch');

        this.showAlert(`Account ${accountNumber} assigned to ${newBatch}`);
        await this.refreshAll();
      } catch (err) {
        this.showAlert(err.message, false);
      }
    },

    async deleteAccount(accountNumber) {
      if (!confirm(`Are you sure you want to delete account ${accountNumber}? (Note: Accounts with transaction history cannot be deleted)`)) return;

      try {
        const res = await fetch(`/api/accounts/${accountNumber}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete account');

        this.showAlert(data.message || 'Account deleted');
        await this.refreshAll();
      } catch (err) {
        this.showAlert(err.message, false);
      }
    },

    // ==========================================
    // DEPOSIT & WITHDRAWAL ACTIONS
    // ==========================================

    async submitTransaction() {
      const { accountNumber, type, amount, description } = this.transactionForm;
      const endpoint = type === 'Deposit' ? '/api/transactions/deposit' : '/api/transactions/withdraw';

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountNumber, amount, description })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to process ${type.toLowerCase()}`);

        this.showAlert(data.message);
        this.transactionForm.amount = '';
        this.transactionForm.description = '';
        await this.refreshAll();
      } catch (err) {
        this.showAlert(err.message, false);
      }
    },

    // ==========================================
    // MONEY TRANSFER ACTION
    // ==========================================

    async submitTransfer() {
      const { fromAccount, toAccount, amount, description } = this.transferForm;

      try {
        const res = await fetch('/api/transactions/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromAccount, toAccount, amount, description })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to execute transfer');

        this.showAlert(data.message);
        this.transferForm = {
          fromAccount: '',
          toAccount: '',
          amount: '',
          description: ''
        };
        await this.refreshAll();
      } catch (err) {
        this.showAlert(err.message, false);
      }
    },

    // ==========================================
    // HTML5 DRAG-AND-DROP API
    // ==========================================

    // HTML Drag and Drop API reference:
    // https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API
    // DataTransfer reference:
    // https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer
    onDragStart(event, account) {
      this.draggedAccount = account;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', account.accountNumber);
      event.target.classList.add('dragging');
    },

    onDragOver(event, zoneName) {
      event.preventDefault(); // Necessary to allow dropping
      event.dataTransfer.dropEffect = 'move';
      this.dragOverZone = zoneName;
    },

    onDragLeave(event, zoneName) {
      if (this.dragOverZone === zoneName) {
        this.dragOverZone = null;
      }
    },

    async onDrop(event, targetCategory) {
      event.preventDefault();
      this.dragOverZone = null;

      const accountNumber = event.dataTransfer.getData('text/plain') || (this.draggedAccount && this.draggedAccount.accountNumber);
      if (!accountNumber) return;

      const account = this.accounts.find(a => a.accountNumber === accountNumber);
      if (!account) return;

      // Validate target category
      // Array includes: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes
      if (!['Savings', 'Current'].includes(targetCategory)) {
        this.showAlert('Invalid category dropped', false);
        return;
      }

      if (account.accountType === targetCategory) {
        this.showAlert(`Account ${accountNumber} is already in the ${targetCategory} category.`);
        return;
      }

      // Send update to MongoDB via Node.js REST API
      // Fetch API: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
      try {
        const res = await fetch(`/api/accounts/${accountNumber}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountType: targetCategory })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update account category');

        this.showAlert(`[Drag & Drop] Account ${accountNumber} moved to ${targetCategory} and saved to MongoDB!`);
        await this.refreshAll();
      } catch (err) {
        this.showAlert(err.message, false);
      } finally {
        this.draggedAccount = null;
      }
    },

    // ==========================================
    // HTML5 GEOLOCATION API
    // ==========================================

    // Geolocation API:
    // https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
    // getCurrentPosition():
    // https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition
    getGeoLocation() {
      if (!navigator.geolocation) {
        this.geoData.error = 'HTML5 Geolocation is not supported by your browser.';
        return;
      }

      this.geoData.loading = true;
      this.geoData.error = null;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.geoData.latitude = position.coords.latitude;
          this.geoData.longitude = position.coords.longitude;
          this.geoData.accuracy = position.coords.accuracy;

          // Date and time formatting:
          // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleTimeString
          this.geoData.timestamp = new Date(position.timestamp).toLocaleTimeString();
          this.geoData.loading = false;
          this.showAlert('Location obtained successfully via HTML5 Geolocation API!');
        },
        (error) => {
          // GeolocationPositionError:
          // https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPositionError
          this.geoData.loading = false;
          switch (error.code) {
            case error.PERMISSION_DENIED:
              this.geoData.error = 'Permission denied. You declined the browser location prompt.';
              break;
            case error.POSITION_UNAVAILABLE:
              this.geoData.error = 'Location information is unavailable on your device.';
              break;
            case error.TIMEOUT:
              this.geoData.error = 'The request to obtain user location timed out.';
              break;
            default:
              this.geoData.error = `An unknown error occurred (${error.message}).`;
              break;
          }
          this.showAlert(`Geolocation Error: ${this.geoData.error}`, false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    }
  },

  // mounted() runs after the Vue component has been mounted to the page.
  // Reference: https://vuejs.org/guide/essentials/lifecycle.html#registering-lifecycle-hooks
  mounted() {
    this.loadPreferences();
    this.refreshAll();
  }
  // Vue mount reference: https://vuejs.org/api/application.html#app-mount
}).mount('#app');