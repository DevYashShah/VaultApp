// --- State ---
let masterPassword = null;
let currentCategory = null;
let currentFolderId = null;
let fileHandle = null;
let pendingEncryptedData = null;
let vaultData = {
    passwords: [],
    bank: []
};

// --- DOM Elements ---
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const passwordInput = document.getElementById('master-password');
const fileSelectionArea = document.getElementById('file-selection-area');
const btnOpenVaultFile = document.getElementById('btn-open-vault');
const btnCreateVaultFile = document.getElementById('btn-create-vault');
const btnCancelLogin = document.getElementById('btn-cancel-login');
const loginHelperText = document.getElementById('login-helper-text');
const fallbackWarning = document.getElementById('fallback-warning');
const sidebarNavSections = document.getElementById('sidebar-nav-sections');
const currentFolderTitle = document.getElementById('current-folder-title');
const itemsContainer = document.getElementById('items-container');
const searchInput = document.getElementById('search-input');

// Folder Modal Elements
const folderModal = document.getElementById('folder-modal');
const folderForm = document.getElementById('folder-form');
const folderModalTitle = document.getElementById('folder-modal-title');
const btnCloseFolderModal = document.getElementById('btn-close-folder-modal');
const folderIdInput = document.getElementById('folder-id');
const folderTitleInput = document.getElementById('folder-title');
const folderCategorySelect = document.getElementById('folder-category');

// Details Pane Elements
const detailsEmptyState = document.getElementById('details-empty-state');
const detailsContentState = document.getElementById('details-content-state');
const detailsAvatar = document.getElementById('details-avatar');
const detailsTitle = document.getElementById('details-title');
const detailsTag = document.getElementById('details-tag');
const btnEditItem = document.getElementById('btn-edit-item');
const btnDeleteItem = document.getElementById('btn-delete-item');
const detailsBodyView = document.getElementById('details-body-view');
const detailsBodyEdit = document.getElementById('details-body-edit');
const btnCancelEdit = document.getElementById('btn-cancel-edit');

// Item Form (Edit Mode)
const itemForm = document.getElementById('item-form');
const itemEntryIndexInput = document.getElementById('item-entry-index');
const entryNameInput = document.getElementById('entry-name');
const dynamicFieldsContainer = document.getElementById('dynamic-fields-container');

let activeEntryIndex = null;

// Action Buttons
const btnAddFolder = document.getElementById('btn-add-folder');
const btnAddNewItem = document.getElementById('btn-add-new-item');
const btnFolderOptions = document.getElementById('btn-folder-options');
const btnLock = document.getElementById('btn-lock');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const btnImportInitial = document.getElementById('btn-import-initial');
const fileImportInput = document.getElementById('file-import-input');

// --- Configuration ---
const STORAGE_KEY = 'ipad_vault_data';

const categoryConfig = {
    passwords: [
        { id: 'username', label: 'Username / Email', type: 'text' },
        { id: 'password', label: 'Password', type: 'password', isSecret: true }
    ],
    bank: [
        { id: 'accountName', label: 'Account Name/Type', type: 'text' },
        { id: 'accountNumber', label: 'Account Number', type: 'text', isSecret: true },
        { id: 'routingNumber', label: 'Routing Number', type: 'text', isSecret: true },
        { id: 'cardNumber', label: 'Card Number', type: 'text', isSecret: true },
        { id: 'cvv', label: 'CVV', type: 'password', isSecret: true },
        { id: 'pin', label: 'PIN', type: 'password', isSecret: true }
    ]
};

const categoryTitles = {
    passwords: 'Passwords',
    bank: 'Bank Information'
};

const categoryIcons = {
    passwords: 'fa-key',
    bank: 'fa-building-columns'
};

// --- Crypto Functions ---
function encrypt(data, pwd) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), pwd).toString();
}

function decrypt(ciphertext, pwd) {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, pwd);
        const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
        if (!decryptedString) return null;
        return JSON.parse(decryptedString);
    } catch (e) {
        return null;
    }
}

function init() {
    // Event Listeners
    loginForm.addEventListener('submit', handleLogin);
    btnLock.addEventListener('click', lockVault);
    
    btnAddFolder.addEventListener('click', () => openFolderModal());
    btnCloseFolderModal.addEventListener('click', closeFolderModal);
    folderForm.addEventListener('submit', saveFolder);
    
    btnAddNewItem.addEventListener('click', () => openItemEdit(null));
    btnEditItem.addEventListener('click', () => openItemEdit(activeEntryIndex));
    btnCancelEdit.addEventListener('click', cancelItemEdit);
    
    itemForm.addEventListener('submit', saveItem);
    btnDeleteItem.addEventListener('click', deleteItem);
    
    btnFolderOptions.addEventListener('click', deleteFolder);
    
    searchInput.addEventListener('input', renderItems);

    btnExport.addEventListener('click', exportVault);

    // Initial state / File System Check
    if (!window.showOpenFilePicker) {
        fallbackWarning.classList.remove('hidden');
        fileSelectionArea.classList.add('hidden');
        loginForm.classList.remove('hidden');
        btnCancelLogin.classList.add('hidden');
        
        if (localStorage.getItem(STORAGE_KEY)) {
            loginHelperText.innerText = "Vault found in browser storage. Enter your master password to unlock.";
        } else {
            loginHelperText.innerText = "No vault found. Entering a password will create a new one in browser storage.";
        }
    } else {
        btnOpenVaultFile.addEventListener('click', handleOpenLocalVault);
        btnCreateVaultFile.addEventListener('click', handleCreateLocalVault);
        btnCancelLogin.addEventListener('click', () => {
            loginForm.classList.add('hidden');
            fileSelectionArea.classList.remove('hidden');
            pendingEncryptedData = null;
            fileHandle = null;
            loginHelperText.innerText = "Select or create a physical file on your device to continue.";
        });
    }
}

async function handleOpenLocalVault() {
    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{ description: 'Encrypted Vault', accept: {'application/octet-stream': ['.enc']} }],
            multiple: false
        });
        fileHandle = handle;
        const file = await fileHandle.getFile();
        pendingEncryptedData = await file.text();
        
        fileSelectionArea.classList.add('hidden');
        loginForm.classList.remove('hidden');
        loginHelperText.innerText = `Selected ${file.name}. Enter your master password to unlock.`;
        passwordInput.focus();
    } catch (e) {
        console.error('User cancelled or error opening file:', e);
    }
}

async function handleCreateLocalVault() {
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: 'my_vault.enc',
            types: [{ description: 'Encrypted Vault', accept: {'application/octet-stream': ['.enc']} }]
        });
        fileHandle = handle;
        pendingEncryptedData = null; // New vault
        
        fileSelectionArea.classList.add('hidden');
        loginForm.classList.remove('hidden');
        loginHelperText.innerText = `Created ${handle.name}. Enter a strong password to lock it.`;
        passwordInput.focus();
    } catch (e) {
        console.error('User cancelled or error creating file:', e);
    }
}

function runMigration() {
    Object.keys(categoryConfig).forEach(cat => {
        if (!vaultData[cat]) vaultData[cat] = [];
        
        vaultData[cat] = vaultData[cat].map(folder => {
            if (folder.data && !folder.entries) {
                folder.entries = [folder.data];
                delete folder.data;
            }
            if (!folder.entries) folder.entries = [];
            
            // Assign entryName if missing
            folder.entries = folder.entries.map(entry => {
                if (!entry.entryName) {
                    const firstKey = Object.keys(entry).find(k => k !== 'entryName');
                    entry.entryName = firstKey ? entry[firstKey] : 'Unnamed Entry';
                }
                return entry;
            });
            return folder;
        });
    });
}

function handleLogin(e) {
    e.preventDefault();
    const pwd = passwordInput.value;
    
    if (fileHandle) {
        if (pendingEncryptedData) {
            const decrypted = decrypt(pendingEncryptedData, pwd);
            if (decrypted) {
                masterPassword = pwd;
                vaultData = decrypted;
                runMigration();
                unlockVault();
            } else {
                showToast('Incorrect master password!', true);
            }
        } else {
            // Creating new vault
            masterPassword = pwd;
            saveVault();
            unlockVault();
        }
    } else {
        // Fallback Local Storage logic
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            const decrypted = decrypt(storedData, pwd);
            if (decrypted) {
                masterPassword = pwd;
                vaultData = decrypted;
                runMigration();
                unlockVault();
            } else {
                showToast('Incorrect master password!', true);
            }
        } else {
            masterPassword = pwd;
            saveVault();
            unlockVault();
        }
    }
}

function unlockVault() {
    loginScreen.classList.remove('active');
    appScreen.classList.add('active');
    passwordInput.value = '';
    
    // Select first folder if available
    currentCategory = null;
    currentFolderId = null;
    for (const cat of Object.keys(vaultData)) {
        if (vaultData[cat] && vaultData[cat].length > 0) {
            currentCategory = cat;
            currentFolderId = vaultData[cat][0].id;
            break;
        }
    }
    
    renderSidebar();
    showEmptyDetails();
    renderItems();
    showToast('Vault unlocked successfully');
}

function lockVault() {
    masterPassword = null;
    vaultData = { passwords: [], bank: [] };
    appScreen.classList.remove('active');
    loginScreen.classList.add('active');
    fileSelectionArea.classList.remove('hidden');
    loginForm.classList.add('hidden');
    loginHelperText.innerText = "Select or create a physical file on your device to continue.";
    
    if (!window.showOpenFilePicker) {
        fileSelectionArea.classList.add('hidden');
        loginForm.classList.remove('hidden');
    }
    
    showToast('Vault locked');
}

async function saveVault() {
    if (!masterPassword) return;
    const encrypted = encrypt(vaultData, masterPassword);
    
    if (fileHandle) {
        try {
            const writable = await fileHandle.createWritable();
            await writable.write(encrypted);
            await writable.close();
            // Also store in localStorage as a backup
            localStorage.setItem(STORAGE_KEY, encrypted);
        } catch (err) {
            console.error('Failed to write to file:', err);
            showToast('Failed to save to physical file!', true);
        }
    } else {
        localStorage.setItem(STORAGE_KEY, encrypted);
    }
}

function selectFolder(cat, folderId) {
    currentCategory = cat;
    currentFolderId = folderId;
    searchInput.value = ''; // clear search on switch
    showEmptyDetails();
    renderSidebar(); // update active state
    renderItems();
}

// --- Rendering ---
function renderSidebar() {
    sidebarNavSections.innerHTML = '';
    
    Object.keys(categoryTitles).forEach(cat => {
        const folders = vaultData[cat] || [];
        
        const section = document.createElement('div');
        section.className = 'nav-section';
        
        const header = document.createElement('div');
        header.className = 'nav-section-header';
        // Check if any folder in this category is currently selected to keep it open
        const isCurrentCat = currentCategory === cat;
        if (!isCurrentCat) header.classList.add('collapsed');
        
        header.innerHTML = `<i class="fa-solid fa-chevron-down"></i> <span>${categoryTitles[cat]}</span>`;
        
        const ul = document.createElement('ul');
        ul.className = 'nav-folders';
        ul.style.display = isCurrentCat ? 'block' : 'none';
        
        header.onclick = () => {
            header.classList.toggle('collapsed');
            ul.style.display = header.classList.contains('collapsed') ? 'none' : 'block';
        };
        
        folders.forEach(folder => {
            const isActive = currentFolderId === folder.id;
            const li = document.createElement('li');
            li.className = `nav-folder ${isActive ? 'active' : ''}`;
            li.innerHTML = `
                <span>${escapeHtml(folder.title)}</span>
                <span class="nav-folder-count">${folder.entries.length}</span>
            `;
            li.onclick = () => selectFolder(cat, folder.id);
            ul.appendChild(li);
        });
        
        section.appendChild(header);
        section.appendChild(ul);
        sidebarNavSections.appendChild(section);
    });
}

function getColorForLetter(letter) {
    const colors = ['#ff3b30', '#ff9500', '#ffcc00', '#32d74b', '#5ac8fa', '#0a84ff', '#5856d6', '#ff2d55'];
    const code = letter.charCodeAt(0) || 0;
    return colors[code % colors.length];
}

function renderItems() {
    const folder = currentCategory ? (vaultData[currentCategory] || []).find(f => f.id === currentFolderId) : null;
    
    if (!folder) {
        currentFolderTitle.innerText = 'Select a Folder';
        btnFolderOptions.classList.add('hidden');
        btnAddNewItem.classList.add('hidden');
        itemsContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 60px 20px;">
                <i class="fa-regular fa-folder-open" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <p>No folder selected. Select or create a folder in the sidebar.</p>
            </div>
        `;
        showEmptyDetails();
        return;
    }
    
    currentFolderTitle.innerText = folder.title;
    btnFolderOptions.classList.remove('hidden');
    btnAddNewItem.classList.remove('hidden');
    
    const query = searchInput.value.toLowerCase();
    
    itemsContainer.innerHTML = '';
    
    let entriesToShow = folder.entries;
    if (query) {
        entriesToShow = folder.entries.filter(entry => {
            return Object.values(entry).some(val => String(val).toLowerCase().includes(query));
        });
    }

    if (entriesToShow.length === 0) {
        itemsContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 40px;">
                <p>${query ? 'No matching items found.' : 'Folder is empty. Click "New Item" to create one.'}</p>
            </div>
        `;
        return;
    }

    let hasActive = false;
    entriesToShow.forEach((entry, idx) => {
        const originalIdx = query ? folder.entries.indexOf(entry) : idx;
        
        const div = document.createElement('div');
        div.className = `list-item ${originalIdx === activeEntryIndex ? 'active' : ''}`;
        if (originalIdx === activeEntryIndex) hasActive = true;
        
        div.onclick = () => viewItem(originalIdx);
        
        const catTitle = categoryTitles[currentCategory].split(' ')[0];
        const letter = (entry.entryName || 'U').charAt(0).toUpperCase();
        const bgColor = getColorForLetter(letter);
        
        div.innerHTML = `
            <div class="list-avatar" style="background-color: ${bgColor}">${letter}</div>
            <div class="list-item-content">
                <div class="list-item-title">${escapeHtml(entry.entryName || 'Unnamed')}</div>
                <div class="list-item-subtitle">${catTitle}</div>
            </div>
        `;
        itemsContainer.appendChild(div);
    });
    
    if (activeEntryIndex !== null && !hasActive && !query) {
        showEmptyDetails();
    }
}

// --- Folder Modal Logic ---
function openFolderModal() {
    folderModalTitle.innerText = 'New Folder';
    folderIdInput.value = '';
    folderTitleInput.value = '';
    folderCategorySelect.value = currentCategory || 'passwords';
    folderModal.classList.remove('hidden');
}

function closeFolderModal() {
    folderModal.classList.add('hidden');
    folderForm.reset();
}

function saveFolder(e) {
    e.preventDefault();
    const id = generateId();
    const title = folderTitleInput.value.trim();
    const category = folderCategorySelect.value;
    
    vaultData[category].push({ id, title, entries: [], updated: Date.now() });
    
    saveVault();
    selectFolder(category, id);
    closeFolderModal();
    showToast('Folder created');
}

function deleteFolder() {
    if (!currentFolderId || !currentCategory) return;
    if (!confirm('Are you sure you want to delete this folder and ALL its contents?')) return;
    
    vaultData[currentCategory] = vaultData[currentCategory].filter(f => f.id !== currentFolderId);
    currentFolderId = null;
    
    saveVault();
    renderSidebar();
    renderItems();
    showToast('Folder deleted');
}

// --- Details Pane & Form Logic ---
function showEmptyDetails() {
    activeEntryIndex = null;
    detailsEmptyState.classList.remove('hidden');
    detailsContentState.classList.add('hidden');
}

window.toggleVisibility = function(btn) {
    const valText = btn.parentElement.previousElementSibling;
    const isHidden = valText.querySelector('.field-hidden');
    if (isHidden) {
        valText.innerHTML = valText.dataset.val;
        btn.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';
    } else {
        valText.innerHTML = '<span class="field-hidden">••••••••</span>';
        btn.innerHTML = '<i class="fa-regular fa-eye"></i>';
    }
}

function viewItem(entryIndex) {
    if (!currentFolderId) return;
    const folder = vaultData[currentCategory].find(f => f.id === currentFolderId);
    const entry = folder.entries[entryIndex];
    if (!entry) return;
    
    activeEntryIndex = entryIndex;
    renderItems(); // update active highlight
    
    const letter = (entry.entryName || 'U').charAt(0).toUpperCase();
    detailsAvatar.innerText = letter;
    detailsAvatar.style.backgroundColor = getColorForLetter(letter);
    detailsTitle.innerText = entry.entryName || 'Unnamed';
    detailsTag.innerText = categoryTitles[currentCategory];
    
    detailsBodyView.innerHTML = '';
    const fields = categoryConfig[currentCategory];
    
    fields.forEach(field => {
        if (!entry[field.id]) return; // Skip empty fields
        
        const div = document.createElement('div');
        div.className = 'details-field';
        
        let displayValue = escapeHtml(entry[field.id]);
        if (field.isSecret) {
            displayValue = '<span class="field-hidden">••••••••</span>';
        }
        
        const copySafeVal = escapeHtml(entry[field.id]).replace(/'/g, "\\'");
        
        div.innerHTML = `
            <div class="details-field-label">${field.label}</div>
            <div class="details-field-value">
                <div class="val-text" data-val="${escapeHtml(entry[field.id])}">${displayValue}</div>
                <div class="details-field-actions">
                    ${field.isSecret ? `<button class="btn-icon" onclick="toggleVisibility(this)" title="Reveal"><i class="fa-regular fa-eye"></i></button>` : ''}
                    <button class="btn-icon" onclick="copyToClipboard('${copySafeVal}')" title="Copy"><i class="fa-regular fa-copy"></i></button>
                </div>
            </div>
        `;
        detailsBodyView.appendChild(div);
    });
    
    detailsBodyView.classList.remove('hidden');
    detailsBodyEdit.classList.add('hidden');
    detailsEmptyState.classList.add('hidden');
    detailsContentState.classList.remove('hidden');
}

function buildItemFormFields(entryData = {}) {
    dynamicFieldsContainer.innerHTML = '';
    const fields = categoryConfig[currentCategory];
    
    fields.forEach(field => {
        const group = document.createElement('div');
        group.className = 'form-group';
        
        const label = document.createElement('label');
        label.innerText = field.label;
        label.setAttribute('for', `field-${field.id}`);
        
        let input;
        if (field.type === 'textarea') {
            input = document.createElement('textarea');
        } else {
            input = document.createElement('input');
            input.type = field.type;
        }
        
        input.id = `field-${field.id}`;
        input.dataset.fieldId = field.id;
        input.value = entryData[field.id] || '';
        
        group.appendChild(label);
        group.appendChild(input);
        dynamicFieldsContainer.appendChild(group);
    });
}

function openItemEdit(entryIndex = null) {
    if (!currentFolderId) return;
    const folder = vaultData[currentCategory].find(f => f.id === currentFolderId);
    
    detailsBodyView.classList.add('hidden');
    detailsBodyEdit.classList.remove('hidden');
    detailsEmptyState.classList.add('hidden');
    detailsContentState.classList.remove('hidden');
    
    if (entryIndex !== null) {
        const entry = folder.entries[entryIndex];
        itemEntryIndexInput.value = entryIndex;
        entryNameInput.value = entry.entryName || '';
        buildItemFormFields(entry);
    } else {
        activeEntryIndex = null;
        renderItems(); // remove highlight
        detailsAvatar.innerText = '+';
        detailsAvatar.style.backgroundColor = 'var(--primary)';
        detailsTitle.innerText = 'New Item';
        detailsTag.innerText = categoryTitles[currentCategory];
        
        itemEntryIndexInput.value = '';
        entryNameInput.value = '';
        buildItemFormFields({});
    }
}

function cancelItemEdit() {
    if (activeEntryIndex !== null) {
        viewItem(activeEntryIndex);
    } else {
        showEmptyDetails();
    }
}

function saveItem(e) {
    e.preventDefault();
    const folder = vaultData[currentCategory].find(f => f.id === currentFolderId);
    if (!folder) return;
    
    const entryName = entryNameInput.value.trim();
    const entryIndex = itemEntryIndexInput.value;
    
    const entryData = { entryName };
    const fields = categoryConfig[currentCategory];
    
    fields.forEach(field => {
        const input = document.getElementById(`field-${field.id}`);
        if (input) {
            entryData[field.id] = input.value.trim();
        }
    });

    let targetIndex = entryIndex !== '' ? parseInt(entryIndex) : folder.entries.length;

    if (entryIndex !== '') {
        folder.entries[targetIndex] = entryData;
        showToast('Item updated');
    } else {
        folder.entries.push(entryData);
        showToast('Item added');
    }

    folder.updated = Date.now();
    saveVault();
    renderSidebar(); // Update count
    viewItem(targetIndex); // Show the saved item in view mode
}

function deleteItem() {
    if (activeEntryIndex === null) return;
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    const folder = vaultData[currentCategory].find(f => f.id === currentFolderId);
    
    if (folder) {
        folder.entries.splice(activeEntryIndex, 1);
        saveVault();
        renderSidebar(); // Update count
        showEmptyDetails();
        renderItems();
        showToast('Item deleted');
    }
}

// --- Import / Export ---
function exportVault() {
    if (!masterPassword) return;
    
    const encrypted = localStorage.getItem(STORAGE_KEY);
    if (!encrypted) {
        showToast('No data to export', true);
        return;
    }

    const blob = new Blob([encrypted], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vault_backup_${new Date().toISOString().split('T')[0]}.enc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Vault exported successfully');
}

function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const content = event.target.result;
        
        if (!content.startsWith('U2FsdGVkX1') && content.length > 0) {
            console.warn('Imported file might not be a valid CryptoJS encrypted string.');
        }

        localStorage.setItem(STORAGE_KEY, content);
        
        if (masterPassword) lockVault();
        
        document.querySelector('.helper-text').innerText = "Vault imported! Enter the master password used to create it.";
        showToast('File imported! Please login to verify.');
        fileImportInput.value = ''; 
    };
    reader.readAsText(file);
}

// --- Utilities ---
function generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

let toastTimeout;
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').innerText = message;
    
    toast.style.background = isError ? 'var(--danger)' : 'var(--success)';
    toast.classList.add('show');
    
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard');
        });
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            showToast('Copied to clipboard');
        } catch (err) {
            showToast('Failed to copy', true);
        }
        document.body.removeChild(textArea);
    }
}

// Start
document.addEventListener('DOMContentLoaded', init);
