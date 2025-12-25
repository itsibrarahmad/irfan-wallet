# Deposit & Withdrawal Feature - Quick Start Guide

## For Users

### Making a Deposit
```
Dashboard → Sidebar "Deposit & Withdraw"
            ↓
         Click "💳 Deposit"
            ↓
    Upload Payment Screenshot
    + Enter Amount (min 100 PKR)
            ↓
       Click "Submit Deposit"
            ↓
   Red Message: "Wait 5 minutes..."
            ↓
    Admin reviews and approves
            ↓
   ✓ Success notification appears
```

### Making a Withdrawal
```
Dashboard → Sidebar "Deposit & Withdraw"
            ↓
      Click "🏦 Withdrawal"
            ↓
    Upload Withdrawal Proof
    + Enter Amount (min 100 PKR)
            ↓
    Click "Submit Request"
            ↓
   Red Message: "Wait 5 minutes..."
            ↓
    Admin reviews and approves
            ↓
   ✓ Funds processed notification
```

### Viewing Transaction History
```
Dashboard → "Deposit & Withdraw"
            ↓
      Scroll to "Transaction History"
            ↓
    View all transactions with:
    - Status badge (pending/approved/rejected)
    - Amount and type
    - Date
    - Screenshot preview
    - Rejection reason (if rejected)
```

---

## For Admins

### Approving Transactions
```
Dashboard → Admin Nav → "💰 Transactions"
            ↓
    See all pending requests
            ↓
    Review user info & screenshot
            ↓
       Click "✓ Approve"
            ↓
   ✓ Transaction approved
      User notified automatically
```

### Rejecting Transactions
```
Dashboard → Admin Nav → "💰 Transactions"
            ↓
    See all pending requests
            ↓
    Review user info & screenshot
            ↓
       Click "✗ Reject"
            ↓
    Enter reason (e.g., "Wrong account")
            ↓
   ✗ Transaction rejected
      User sees reason in history
```

---

## Screenshots/UI Elements

### User Modal - Deposit Form
```
┌─────────────────────────────────────┐
│  ✕  💳 Deposit Funds                 │
├─────────────────────────────────────┤
│  Payment Screenshot *                │
│  ┌─────────────────────────────────┐ │
│  │   Click to upload proof image   │ │
│  └─────────────────────────────────┘ │
│  [Choose Screenshot]                 │
│                                       │
│  Amount (PKR) *                       │
│  [____________100_____________]       │
│                                       │
│      [Cancel]    [Submit Deposit]     │
└─────────────────────────────────────┘
```

### Admin Transaction Card
```
┌────────────────────────────────────────────┐
│  John Doe                    [PENDING]      │
│  john@example.com • 03001234567            │
├────────────────────────────────────────────┤
│  Transaction Type: 💳 Deposit              │
│  Amount: PKR 5000                          │
│                                            │
│  [Screenshot Preview Image]                │
│                                            │
│  [✓ Approve]  [✗ Reject]                   │
└────────────────────────────────────────────┘
```

### Transaction History Item
```
┌────────────────────────────────────────────┐
│  💳 Deposit          [APPROVED]             │
│                                            │
│  PKR 5000                                  │
│  Dec 10, 2024                              │
│                                            │
│  [Payment Proof Screenshot]                │
└────────────────────────────────────────────┘
```

---

## API Quick Reference

### Submit Transaction (User)
```bash
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "deposit",
    "amount": 5000,
    "screenshot": "data:image/png;base64,iVBORw0KGgo..."
  }'
```

### Get Admin Transactions
```bash
curl http://localhost:3000/api/admin/transactions?status=pending
```

### Approve Transaction
```bash
curl -X PATCH http://localhost:3000/api/admin/transactions/[ID] \
  -H "Content-Type: application/json" \
  -d '{"status": "approved"}'
```

### Reject Transaction
```bash
curl -X PATCH http://localhost:3000/api/admin/transactions/[ID] \
  -H "Content-Type: application/json" \
  -d '{"status": "rejected", "comment": "Invalid account number"}'
```

---

## Key Settings (Customizable)

In `dashboard.html` JavaScript:

```javascript
// Minimum amount (PKR)
if (amount < 100) { // Change 100 to desired minimum
  alert('Minimum deposit amount is 100 PKR');
}

// Waiting time before dismissing modal (milliseconds)
setTimeout(() => {
  closeModal('depositModal');
  loadTransactions();
}, 5000);  // Change 5000 to different duration
```

---

## Status Colors
- 🟠 **Pending** (Orange): Waiting for admin review
- 🟢 **Approved** (Green): Successfully processed
- 🔴 **Rejected** (Red): Not approved, see reason

---

## Error Handling
- Amount validation: "Minimum amount is 100 PKR"
- Missing fields: "Please provide both screenshot and amount"
- Upload errors: "Error submitting deposit"
- Network errors: "Error loading transactions"

---

## Features Included
✅ User-friendly modals with image preview
✅ Real-time screenshot upload and preview
✅ Base64 image encoding for database storage
✅ Admin approval/rejection workflow
✅ Transaction history with status tracking
✅ Rejection reasons display
✅ Responsive mobile design
✅ Smooth animations and transitions
✅ Comprehensive error handling
✅ Professional UI with color-coded statuses

---

## Notes
- Screenshots are stored as base64 strings (max ~5MB)
- For production, consider using Cloudinary or AWS S3
- All operations require user authentication
- Admin operations require admin role
- Minimum amount can be configured in code
- Waiting period is 5 seconds (see line in code comments)
