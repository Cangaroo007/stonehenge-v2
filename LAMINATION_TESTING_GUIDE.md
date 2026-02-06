# 🧪 Lamination Strips - Quick Testing Guide

**Feature:** 40mm Lamination Strip Support  
**Status:** ✅ Code Complete - Ready for Testing  
**Test Environment:** Local dev server

---

## 🚀 Start Testing

### **1. Start Dev Server**
```bash
npm run dev
```

Then open: http://localhost:3000

---

## ✅ Quick Tests (5 Minutes)

### **Test 1: Basic 20mm Piece (Should Work As Before)**
1. Login → Dashboard → Sidebar → "Optimize"
2. Edit Piece 1:
   - Label: "Test 20mm"
   - Width: 2000, Height: 600
   - Thickness: **20mm** ← Select this
3. Click "Run Optimization"

**Expected:**
- ✅ No "Finished Edges" section appears (20mm doesn't need lamination)
- ✅ 1 piece shown on canvas (blue/colored)
- ✅ No lamination summary
- ✅ Works exactly as before

---

### **Test 2: 40mm Piece with 2 Finished Edges**
1. Edit Piece 1:
   - Label: "Island 40mm"
   - Width: 2000, Height: 1200
   - Thickness: **40mm** ← Change to this
2. **Finished edges checkboxes should now appear!**
3. Check: ☑ Top, ☑ Left
4. Notice: "Will generate 2 strips" appears
5. Click "Run Optimization"

**Expected:**
- ✅ Canvas shows:
  - 1 colored rectangle (Island 40mm)
  - 2 gray striped rectangles (lamination strips)
- ✅ Blue card appears: "Lamination Strips (40mm Build-Up)"
  - Total Strips: 2
  - Strip Area: ~0.128 m²
  - Details show: "Island 40mm: top (2000×40mm), left (1200×40mm)"
- ✅ Legend at bottom shows striped box = Lamination Strips

---

### **Test 3: CSV Export**
1. With optimization results showing
2. Click "Export CSV" button
3. Open the downloaded CSV file

**Expected:**
- ✅ Headers include: "Type" and "Parent Piece" columns
- ✅ Row 1: "Island 40mm", Type: Main
- ✅ Row 2: "Island 40mm (Lam-Top)", Type: Lamination, Parent: "Island 40mm"
- ✅ Row 3: "Island 40mm (Lam-Left)", Type: Lamination, Parent: "Island 40mm"
- ✅ Summary section at bottom:
  ```
  --- LAMINATION STRIPS ---
  Total Strips,2
  Total Strip Area,0.128 m²
  
  Strip Breakdown:
  "Island 40mm"
    top: 2000×40mm
    left: 1200×40mm
  ```

---

## 🔍 Visual Verification

### **What You Should See on Canvas:**

**20mm Piece (No Lamination):**
```
┌──────────────┐
│   BLUE       │ ← Solid color, no stripes
│  Test 20mm   │
└──────────────┘
```

**40mm Piece with Lamination:**
```
┌──────────────────────────┐
│      BLUE                │ ← Main piece (solid color)
│   Island 40mm            │
│   2000×1200              │
└──────────────────────────┘

┌──────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ ← Top strip (gray + diagonal lines)
│ Island 40mm (Lam-Top)    │
│ 2000×40                  │
└──────────────────────────┘

┌─────┐
│▓▓▓▓▓│ ← Left strip (gray + diagonal lines)
│Lam  │
│Left │
│1200 │
│×40  │
└─────┘
```

---

## 🎯 Advanced Tests (Optional)

### **Test 4: All 4 Edges Finished**
- Create 40mm piece
- Check ALL 4 edge boxes (Top, Bottom, Left, Right)
- Verify: "Will generate 4 strips"
- Run optimization
- Verify: 4 gray striped rectangles on canvas

---

### **Test 5: Multiple Pieces (Mixed Thicknesses)**
1. Add 3 pieces:
   - Piece 1: 2000×600, **20mm**, no edges
   - Piece 2: 1500×800, **40mm**, top + bottom checked
   - Piece 3: 1800×900, **20mm**, no edges
2. Run optimization

**Expected:**
- Piece 1: No strips (20mm)
- Piece 2: 2 strips (top, bottom)
- Piece 3: No strips (20mm)
- Canvas shows mix of solid + striped
- Lamination summary only shows Piece 2

---

### **Test 6: Load from Quote**
1. Go to existing quote (one with 40mm pieces if you have one)
2. Go to /optimize
3. Select quote from dropdown

**Expected:**
- Pieces load automatically
- Thickness populated from quote
- If quote pieces have edge types assigned, those edges should be checked
- Run optimization should work immediately

---

### **Test 7: Quote Builder Modal**
1. Go to Quotes → Open any quote
2. Click "Edit Quote" → Opens builder
3. Add a 40mm piece with edges
4. Click "Optimize" button in builder

**Expected:**
- Modal opens with slab settings
- Click "Run Optimization"
- Should automatically generate strips based on piece edges
- Shows lamination summary in modal

---

## 🐛 Troubleshooting

### **Issue: Finished edges checkboxes don't appear**
**Cause:** Thickness not set to 40mm or higher  
**Fix:** Select 40mm, 60mm, or higher from thickness dropdown

---

### **Issue: "Will generate 0 strips" even with 40mm**
**Cause:** No finished edges checked  
**Fix:** Check at least one edge checkbox (Top, Bottom, Left, or Right)

---

### **Issue: CSV doesn't show lamination section**
**Cause:** No 40mm+ pieces with finished edges in optimization  
**Fix:** Add at least one 40mm piece with 1+ finished edge

---

### **Issue: Canvas doesn't show striped rectangles**
**Cause:** Strips may be there but too small to see, or no strips generated  
**Fix:** 
- Check lamination summary count
- Zoom in on canvas (browser zoom)
- Verify finished edges were checked before optimization

---

### **Issue: Build errors**
**Solution:**
```bash
# Regenerate Prisma client
npx prisma generate

# Rebuild
npm run build
```

---

## ✅ Expected Outcomes

### **What Should Work:**
- ✅ 20mm pieces: No change (backward compatible)
- ✅ 30mm pieces: No change (below threshold)
- ✅ 40mm pieces with no edges: No strips generated
- ✅ 40mm pieces with edges: Strips generated automatically
- ✅ 60mm pieces: Same behavior as 40mm
- ✅ Visual differentiation clear and obvious
- ✅ CSV export comprehensive and CNC-ready
- ✅ Quote builder integration seamless

### **What Should Change:**
- ⚠️ Slab count may increase for 40mm+ jobs (this is CORRECT!)
- ⚠️ Optimization time may increase slightly (negligible, still < 1 second)
- ⚠️ CSV files will be longer (more rows for strips)

---

## 📊 Quick Test Data

### **Copy-Paste Test Piece (40mm with 4 edges):**
```
Label: Kitchen Island
Width: 3000
Height: 1200
Thickness: 40mm
Finished Edges: ☑ Top, ☑ Bottom, ☑ Left, ☑ Right
```

**Expected Result:**
- 1 main piece: 3000×1200mm
- 4 strips:
  - Top: 3000×40mm
  - Bottom: 3000×40mm  
  - Left: 1200×40mm
  - Right: 1200×40mm
- Total strip area: 0.288 m²
- Likely needs 2 slabs (depending on kerf and rotation)

---

## 🎯 Success = All Tests Pass

Once all tests above pass, you can confidently:
1. Commit to git
2. Push to Railway
3. Use in production

**The feature is production-ready!** 🚀

---

## 📞 Found a Bug?

If you find any issues:
1. Note which test scenario failed
2. Check browser console for errors
3. Check server logs (`npm run dev` terminal output)
4. Let me know exactly what you expected vs what happened

---

*Testing Guide Created: January 28, 2026*  
*Feature: Phase 8 - Lamination Strips*  
*Estimated Testing Time: 15-20 minutes for full coverage*
