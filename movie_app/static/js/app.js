(function () {
  // Helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Current user state
  let currentUser = null;
  let isAdmin = false;

  const toastEl = $("#toast");
  let toast;
  if (toastEl && window.bootstrap) {
    toast = new bootstrap.Toast(toastEl, { delay: 2500 });
  }
  function showToast(msg, variant = "primary") {
    if (!toastEl) return;
    toastEl.className = `toast align-items-center text-bg-${variant} border-0`;
    $("#toastBody").textContent = msg;
    toast && toast.show();
  }

  function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function imgWithFallback(src, alt = "") {
    const img = document.createElement("img");
    img.alt = alt;
    img.loading = "lazy";
    img.className = "w-100 rounded shadow-sm poster";
    const fallback = (window.APP_CONFIG && window.APP_CONFIG.fallbackPoster) || "";
    img.src = src || fallback;
    img.onerror = () => {
      if (img.src !== fallback) img.src = fallback;
    };
    return img;
  }

  async function apiGet(url) {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`GET ${url} failed`);
    return r.json();
  }
  async function apiPost(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error(`POST ${url} failed`);
    return r.json().catch(() => ({}));
  }

  async function apiDelete(url) {
    const r = await fetch(url, { method: "DELETE", credentials: "same-origin" });
    return r;
  }

  async function deleteMovie(movieId) {
    const r = await apiDelete(`/api/movies/${movieId}`);
    return r.ok;
  }

  // Theme toggle
  const themeToggle = $("#themeToggle");
  const rootHtml = document.documentElement;
  function setTheme(theme) {
    rootHtml.setAttribute("data-bs-theme", theme);
    localStorage.setItem("theme", theme);
  }
  function initTheme() {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
    } else {
      setTheme("light");
    }
  }
  themeToggle && themeToggle.addEventListener("click", () => {
    const current = rootHtml.getAttribute("data-bs-theme") || "light";
    setTheme(current === "light" ? "dark" : "light");
  });
  initTheme();

  // Login page: nothing dynamic here.

  // Dashboard behavior
  const searchInput = $("#searchInput");
  const clearSearchBtn = $("#clearSearchBtn");
  const searchSection = $("#searchSection");
  const searchResults = $("#searchResults");
  const libraryGrid = $("#libraryGrid");
  const pagination = $("#pagination");

  async function initializeApp() {
    try {
      // Get current user info
      const userStatus = await apiGet('/auth/status');
      if (userStatus.authenticated) {
        currentUser = userStatus.username;
        isAdmin = Boolean(userStatus.is_admin);
      } else {
        currentUser = null;
        isAdmin = false;
      }
      loadLibrary(1);
    } catch (error) {
      console.error('Failed to get user status:', error);
      loadLibrary(1);
    }
  }

  const doSearch = debounce(async () => {
    const q = (searchInput.value || "").trim();
    if (!q) {
      searchSection.classList.add("d-none");
      searchResults.innerHTML = "";
      return;
    }
    try {
      const data = await apiGet(`/api/movies/search?q=${encodeURIComponent(q)}`);
      renderSearchResults(data.results || []);
      searchSection.classList.remove("d-none");
    } catch (e) {
      console.error(e);
      showToast("Search failed", "danger");
    }
  }, 350);

  searchInput && searchInput.addEventListener("input", doSearch);
  clearSearchBtn && clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchSection.classList.add("d-none");
    searchResults.innerHTML = "";
  });

  function renderSearchResults(results) {
    searchResults.innerHTML = "";
    if (!results.length) {
      searchResults.innerHTML = `<div class="text-muted">No results</div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    results.forEach((r) => {
      const col = document.createElement("div");
      col.className = "col-6 col-sm-4 col-md-3 col-lg-2";
      const card = document.createElement("div");
      card.className = "card h-100";
      const img = imgWithFallback(r.poster_url, r.title);
      img.classList.add("card-img-top");
      const body = document.createElement("div");
      body.className = "card-body p-2";
      const title = document.createElement("div");
      title.className = "small fw-semibold text-truncate";
      title.title = r.title || "";
      title.textContent = r.title || "";
      const meta = document.createElement("div");
      meta.className = "small text-muted";
      meta.textContent = r.year ? String(r.year) : "";
      const addBtn = document.createElement("button");
      addBtn.className = "btn btn-sm btn-primary w-100 mt-2";
      addBtn.textContent = "Add";
      addBtn.addEventListener("click", async () => {
        addBtn.disabled = true;
        addBtn.textContent = "Adding…";
        try {
          const res = await apiPost("/api/movies", { tmdb_id: r.tmdb_id });
          if (res && res.ok) {
            showToast("Added to library", "success");
            // Return to library view so the user sees the new movie
            if (searchInput) searchInput.value = "";
            if (searchSection) searchSection.classList.add("d-none");
            if (searchResults) searchResults.innerHTML = "";
            loadLibrary(1);
            // Bring the library into view for good measure
            if (libraryGrid && libraryGrid.scrollIntoView) {
              libraryGrid.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          } else {
            showToast(res.error || "Failed to add", "danger");
          }
        } catch (e) {
          console.error(e);
          showToast("Failed to add", "danger");
        } finally {
          addBtn.disabled = false;
          addBtn.textContent = "Add";
        }
      });

      body.appendChild(title);
      body.appendChild(meta);
      body.appendChild(addBtn);
      card.appendChild(img);
      card.appendChild(body);
      col.appendChild(card);
      frag.appendChild(col);
    });
    searchResults.appendChild(frag);
  }

  async function loadLibrary(page) {
    try {
      const data = await apiGet(`/api/movies?page=${page || 1}`);
      renderLibrary(data.items || []);
      renderPagination(data.total_pages || 1, data.page || 1);
    } catch (e) {
      console.error(e);
      showToast("Failed to load library", "danger");
    }
  }

  function renderLibrary(items) {
    libraryGrid.innerHTML = "";
    if (!items.length) {
      libraryGrid.innerHTML = `<div class="text-muted">No movies yet. Search above to add your first.</div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    items.forEach((m) => {
      const col = document.createElement("div");
      col.className = "col-12 col-lg-6";
      
      // Create new card structure based on example
      const card = document.createElement("div");
      card.className = "movie-card";
      // Delete actions (trash icon in top-right) - available to all users
      if (currentUser) {
        const actions = document.createElement("div");
        actions.className = "movie-actions";
        const delBtn = document.createElement("button");
        delBtn.className = "icon-btn icon-btn-danger";
        delBtn.type = "button";
        delBtn.setAttribute("aria-label", "Delete movie");
        delBtn.title = "Delete";
        delBtn.innerHTML = `
          <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">\n            <polyline points=\"3 6 5 6 21 6\"></polyline>\n            <path d=\"M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6\"></path>\n            <path d=\"M10 11v6\"></path>\n            <path d=\"M14 11v6\"></path>\n            <path d=\"M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2\"></path>\n          </svg>`;
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showDeleteModal(m.id, m.title);
        });
        actions.appendChild(delBtn);
        card.appendChild(actions);
      }
      
      const top = document.createElement("div");
      top.className = "movie-top";
      
      const img = imgWithFallback(m.poster_url, m.title);
      img.className = "movie-poster";
      
      const meta = document.createElement("div");
      meta.className = "movie-meta";
      
      const title = document.createElement("h3");
      title.className = "movie-title";
      title.textContent = m.title || "";
      if (m.year) {
        title.innerHTML = `${m.title} <span style="opacity:.7;font-weight:500">(${m.year})</span>`;
      }
      
      // Add genres section under poster (as requested)
      const genresSection = document.createElement("div");
      genresSection.className = "movie-genres";
      if (m.genres && m.genres.length > 0) {
        m.genres.forEach(genre => {
          const genreBadge = document.createElement("span");
          genreBadge.className = "genre-badge";
          genreBadge.textContent = genre;
          genresSection.appendChild(genreBadge);
        });
      }

      // Delete actions (available to all users)
      if (currentUser) {
        const actions = document.createElement("div");
        actions.className = "d-flex gap-2 mt-1";
        const delBtn = document.createElement("button");
        delBtn.className = "btn btn-sm btn-outline-danger";
        delBtn.type = "button";
        delBtn.textContent = "Delete";
        delBtn.addEventListener("click", () => {
          showDeleteModal(m.id, m.title);
        });
        actions.appendChild(delBtn);
        meta.appendChild(actions);
      }
      
      // All user ratings section
      const ratingsSection = document.createElement("div");
      const ratingsLabel = document.createElement("div");
      ratingsLabel.className = "section-label";
      ratingsLabel.textContent = "Ratings";
      ratingsSection.appendChild(ratingsLabel);
      
      // Show all user ratings (both read-only and interactive for current user)
      const users = ["Alex", "Carrie"];
      users.forEach(username => {
        const row = document.createElement("div");
        row.className = "rating-row";
        
        const who = document.createElement("div");
        who.className = "who";
        const chip = document.createElement("span");
        chip.className = currentUser === username ? "chip chip-interactive" : "chip";
        chip.textContent = username;
        who.appendChild(chip);
        
        // If this is the current user, show interactive rating system
        if (currentUser === username) {
          const ratingContainer = document.createElement("div");
          ratingContainer.style.display = "flex";
          ratingContainer.style.alignItems = "center";
          ratingContainer.style.gap = "10px";
          
          // Create animated rating system
          const ratingForm = document.createElement("form");
          ratingForm.className = "rating";
          ratingForm.id = `rating-${m.id}`;
          
          const starsContainer = document.createElement("div");
          starsContainer.className = "rating__stars";
          
          // Create radio inputs first, then labels (for CSS sibling selectors to work)
          const inputs = [];
          const labels = [];
          
          for (let i = 1; i <= 5; i++) {
            const input = document.createElement("input");
            input.id = `${m.id}-star-${i}`;
            input.className = `rating__input rating__input-${i}`;
            input.type = "radio";
            input.name = `rating-${m.id}`;
            input.value = i;
            input.dataset.movieId = m.id;
            input.addEventListener("change", handleAnimatedStarClick);
            inputs.push(input);
            
            const label = document.createElement("label");
            label.className = "rating__label";
            label.setAttribute("for", `${m.id}-star-${i}`);
            label.innerHTML = '<span class="rating__star"></span>';
            labels.push(label);
          }
          
          // Append all inputs first, then all labels
          inputs.forEach(input => starsContainer.appendChild(input));
          labels.forEach(label => starsContainer.appendChild(label));
          
          ratingForm.appendChild(starsContainer);
          
          const readout = document.createElement("span");
          readout.className = "rating-readout";
          readout.id = `rating-readout-${m.id}`;
          readout.textContent = "No rating";
          
          ratingContainer.appendChild(ratingForm);
          ratingContainer.appendChild(readout);
          
          row.appendChild(who);
          row.appendChild(ratingContainer);
        } else {
          // Show read-only rating
          const ratingDisplay = document.createElement("div");
          ratingDisplay.className = "rating-display";
          
          if (m.ratings && m.ratings[username]) {
            const rating = m.ratings[username];
            ratingDisplay.innerHTML = `<div class="rating-readout">${rating}/5 — ${getRatingAdjective(rating)}</div>`;
          } else {
            ratingDisplay.innerHTML = `<div class="rating-readout">No rating</div>`;
          }
          
          row.appendChild(who);
          row.appendChild(ratingDisplay);
        }
        
        ratingsSection.appendChild(row);
      });

      // Tags section
      const tagsSection = document.createElement("div");
      const tagsLabel = document.createElement("div");
      tagsLabel.className = "section-label";
      tagsLabel.textContent = "Tags";
      tagsSection.appendChild(tagsLabel);
      
      const tagsContainer = document.createElement("div");
      tagsContainer.className = "tags";
      tagsContainer.id = `tags-${m.id}`;
      tagsSection.appendChild(tagsContainer);
      
      const tagCounter = document.createElement("div");
      tagCounter.className = "tag-counter";
      tagCounter.id = `tag-counter-${m.id}`;
      tagCounter.textContent = "0 tags selected";
      tagsSection.appendChild(tagCounter);
      
      // Tag input for adding new tags
      if (currentUser) {
        const tagInputContainer = document.createElement("div");
        tagInputContainer.className = "tag-input-container";
        
        const tagInput = document.createElement("input");
        tagInput.type = "text";
        tagInput.className = "tag-input";
        tagInput.placeholder = "Add tag...";
        tagInput.addEventListener("keypress", (e) => {
          if (e.key === "Enter" && tagInput.value.trim()) {
            addTag(m.id, tagInput.value.trim());
            tagInput.value = "";
          }
        });
        
        // Create dropdown for suggestions
        const suggestionsDropdown = document.createElement("div");
        suggestionsDropdown.className = "tag-suggestions";
        suggestionsDropdown.id = `dropdown-${m.id}`;
        suggestionsDropdown.style.display = "none";
        
        const inputWrapper = document.createElement("div");
        inputWrapper.className = "tag-input-wrapper";
        inputWrapper.appendChild(tagInput);
        inputWrapper.appendChild(suggestionsDropdown);
        
        tagInputContainer.appendChild(inputWrapper);
        
        // Handle input focus/blur and typing for suggestions
        tagInput.addEventListener("focus", () => showTagSuggestions(m.id, tagInput.value));
        tagInput.addEventListener("input", () => showTagSuggestions(m.id, tagInput.value));
        tagInput.addEventListener("blur", (e) => {
          setTimeout(() => {
            document.getElementById(`dropdown-${m.id}`).style.display = "none";
          }, 200);
        });
        
        tagsSection.appendChild(tagInputContainer);
      }

      // Assemble the card
      meta.appendChild(title);
      meta.appendChild(genresSection);
      meta.appendChild(ratingsSection);
      meta.appendChild(tagsSection);
      
      top.appendChild(img);
      top.appendChild(meta);
      card.appendChild(top);
      
      col.appendChild(card);
      frag.appendChild(col);

      // Load existing rating and tags only if user is logged in
      if (currentUser) {
        loadMovieRating(m.id);
        loadMovieTags(m.id);
      }
    });
    libraryGrid.appendChild(frag);
  }

  function renderPagination(totalPages, currentPage) {
    pagination.innerHTML = "";
    if (totalPages <= 1) return;

    const createItem = (label, page, active = false, disabled = false) => {
      const li = document.createElement("li");
      li.className = `page-item ${active ? "active" : ""} ${disabled ? "disabled" : ""}`;
      const a = document.createElement("a");
      a.className = "page-link";
      a.href = "#";
      a.textContent = label;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (!disabled) loadLibrary(page);
      });
      li.appendChild(a);
      return li;
    };

    pagination.appendChild(createItem("«", Math.max(1, currentPage - 1), false, currentPage === 1));

    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let p = start; p <= end; p++) {
      pagination.appendChild(createItem(String(p), p, p === currentPage));
    }

    pagination.appendChild(createItem("»", Math.min(totalPages, currentPage + 1), false, currentPage === totalPages));
  }

  // Old star rating functions removed - using new animated star system

  async function loadMovieRating(movieId) {
    try {
      const result = await apiGet(`/api/movies/${movieId}/review`);
      if (result.rating !== null && result.rating > 0) {
        // Update the animated star rating
        const input = document.querySelector(`input[name="rating-${movieId}"][value="${result.rating}"]`);
        if (input) {
          input.checked = true;
          updateAnimatedStarReadout(movieId, result.rating);
        }
      }
    } catch (error) {
      console.error("Error loading rating:", error);
    }
  }

  // Tags functionality
  async function addTag(movieId, tagName) {
    try {
      const result = await apiPost(`/api/movies/${movieId}/tags`, { name: tagName });
      if (result.ok) {
        loadMovieTags(movieId);
        showToast(`Tag "${tagName}" added`, "success");
      } else {
        showToast(result.error || "Failed to add tag", "danger");
      }
    } catch (error) {
      console.error("Error adding tag:", error);
      showToast("Failed to add tag", "danger");
    }
  }

  async function removeTag(movieId, tagId, tagName) {
    try {
      await fetch(`/api/movies/${movieId}/tags/${tagId}`, { 
        method: "DELETE",
        credentials: "same-origin" 
      });
      loadMovieTags(movieId);
      showToast(`Tag "${tagName}" removed`, "success");
    } catch (error) {
      console.error("Error removing tag:", error);
      showToast("Failed to remove tag", "danger");
    }
  }

  async function loadMovieTags(movieId) {
    try {
      const result = await apiGet(`/api/movies/${movieId}/tags`);
      const tagsContainer = document.getElementById(`tags-${movieId}`);
      const tagCounter = document.getElementById(`tag-counter-${movieId}`);
      if (!tagsContainer) return;
      
      tagsContainer.innerHTML = "";
      const tagCount = result.tags ? result.tags.length : 0;
      
      if (result.tags && result.tags.length > 0) {
        result.tags.forEach((tag, index) => {
          const tagButton = document.createElement("button");
          tagButton.className = `tag p${(index % 7) + 1}`;
          tagButton.type = "button";
          tagButton.dataset.selected = "true";
          tagButton.dataset.tagId = tag.id;
          tagButton.innerHTML = `<span class="dot"></span>${tag.name}`;
          
          // Add click handler to remove tag
          tagButton.addEventListener("click", () => {
            removeTag(movieId, tag.id, tag.name);
          });
          
          tagsContainer.appendChild(tagButton);
        });
      }
      
      // Update tag counter
      if (tagCounter) {
        tagCounter.textContent = `${tagCount} tag${tagCount === 1 ? '' : 's'} selected`;
      }
      
    } catch (error) {
      console.error("Error loading tags:", error);
    }
  }

  async function showTagSuggestions(movieId, searchTerm = "") {
    try {
      const predefinedResult = await apiGet('/api/tags/predefined');
      const currentTagsResult = await apiGet(`/api/movies/${movieId}/tags`);
      const dropdown = document.getElementById(`dropdown-${movieId}`);
      if (!dropdown) return;
      
      const currentTagNames = (currentTagsResult.tags || []).map(tag => tag.name);
      const availableTags = predefinedResult.tags.filter(tag => 
        !currentTagNames.includes(tag.name) && 
        tag.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      dropdown.innerHTML = "";
      
      if (availableTags.length > 0) {
        availableTags.forEach(tag => {
          const option = document.createElement("div");
          option.className = "tag-suggestion";
          option.textContent = tag.name;
          
          option.addEventListener("mouseenter", () => {
            // Only apply tag colors in light mode
            if (document.documentElement.getAttribute("data-bs-theme") !== "dark") {
              option.style.backgroundColor = tag.color;
            }
          });
          option.addEventListener("mouseleave", () => {
            option.style.backgroundColor = "";
          });
          option.addEventListener("click", () => {
            addTag(movieId, tag.name);
            const input = dropdown.closest('.tag-input-wrapper').querySelector('.tag-input');
            if (input) input.value = "";
            dropdown.style.display = "none";
          });
          
          dropdown.appendChild(option);
        });
        dropdown.style.display = "block";
      } else if (searchTerm.trim()) {
        // Show option to add custom tag
        const customOption = document.createElement("div");
        customOption.className = "tag-suggestion custom";
        customOption.textContent = `Add "${searchTerm}"`;
        
        customOption.addEventListener("click", () => {
          addTag(movieId, searchTerm);
          const input = dropdown.closest('.tag-input-wrapper').querySelector('.tag-input');
          if (input) input.value = "";
          dropdown.style.display = "none";
        });
        
        dropdown.appendChild(customOption);
        dropdown.style.display = "block";
      } else {
        dropdown.style.display = "none";
      }
    } catch (error) {
      console.error("Error loading tag suggestions:", error);
    }
  }

  // Helper functions for new UI
  function getRatingAdjective(rating) {
    const adjectives = ['Terrible', 'Bad', 'OK', 'Good', 'Excellent'];
    return adjectives[Math.ceil(rating) - 1] || 'No rating';
  }

  // Animated star functionality
  async function handleAnimatedStarClick(e) {
    const rating = parseInt(e.target.value);
    const movieId = parseInt(e.target.dataset.movieId);
    try {
      const result = await apiPost(`/api/movies/${movieId}/review`, { rating });
      if (result.ok) {
        updateAnimatedStarReadout(movieId, rating);
        showToast("Rating saved", "success");
        loadLibrary(1);
      } else {
        showToast(result.error || "Failed to save rating", "danger");
      }
    } catch (error) {
      console.error("Error saving rating:", error);
      showToast("Failed to save rating", "danger");
    }
  }

  function updateAnimatedStarReadout(movieId, rating) {
    const readout = document.getElementById(`rating-readout-${movieId}`);
    if (readout) {
      readout.textContent = rating ? `${rating}/5 — ${getRatingAdjective(rating)}` : 'No rating';
    }
  }

  // Initialize animated star SVGs
  function initializeStarSVGs() {
    const STAR = `
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <g transform="translate(16,16)"><circle class="rating__star-ring" r="8" /></g>
        <g transform="translate(16,16)">
          <path class="rating__star-stroke" d="M0,-11 L2.9,-3.8 L10.6,-3.1 L4.9,2.1 L6.5,9.7 L0,5.9 L-6.5,9.7 L-4.9,2.1 L-10.6,-3.1 L-2.9,-3.8 Z" />
          <path class="rating__star-fill" d="M0,-11 L2.9,-3.8 L10.6,-3.1 L4.9,2.1 L6.5,9.7 L0,5.9 L-6.5,9.7 L-4.9,2.1 L-10.6,-3.1 L-2.9,-3.8 Z" />
        </g>
        <g transform="translate(16,16)" stroke-dasharray="12 12" stroke-dashoffset="12">
          <polyline class="rating__star-line" transform="rotate(0)" points="0 4,0 16" />
          <polyline class="rating__star-line" transform="rotate(72)" points="0 4,0 16" />
          <polyline class="rating__star-line" transform="rotate(144)" points="0 4,0 16" />
          <polyline class="rating__star-line" transform="rotate(216)" points="0 4,0 16" />
          <polyline class="rating__star-line" transform="rotate(288)" points="0 4,0 16" />
        </g>
      </svg>`;

    // Replace empty star elements with SVG
    document.querySelectorAll('.rating__star:empty').forEach(el => {
      el.innerHTML = STAR;
    });
  }

  // Call after library renders
  const originalRenderLibrary = renderLibrary;
  renderLibrary = function(items) {
    originalRenderLibrary(items);
    // Initialize star SVGs after rendering
    setTimeout(() => {
      initializeStarSVGs();
    }, 10);
  };

  // Delete Modal Functionality
  let deleteModal;
  let currentDeleteMovie = null;

  // Initialize Bootstrap modal
  const deleteModalEl = document.getElementById('deleteModal');
  if (deleteModalEl && window.bootstrap) {
    deleteModal = new bootstrap.Modal(deleteModalEl, {
      keyboard: true,
      backdrop: 'static',  // Prevent clicking outside to close
      focus: true
    });
  }

  function showDeleteModal(movieId, movieTitle) {
    if (!deleteModal) return;
    
    currentDeleteMovie = { id: movieId, title: movieTitle };
    
    // Update modal content
    const titleElement = document.getElementById('deleteMovieTitle');
    if (titleElement) {
      titleElement.textContent = `"${movieTitle}"`;
    }
    
    // Reset button state
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    if (confirmBtn) {
      confirmBtn.disabled = false;
      const deleteText = confirmBtn.querySelector('.delete-text');
      const deleteSpinner = confirmBtn.querySelector('.delete-spinner');
      if (deleteText) deleteText.style.display = 'inline-flex';
      if (deleteSpinner) deleteSpinner.classList.add('d-none');
    }
    
    deleteModal.show();
  }

  // Handle delete confirmation
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
      if (!currentDeleteMovie) return;
      
      // Show loading state
      confirmDeleteBtn.disabled = true;
      const deleteText = confirmDeleteBtn.querySelector('.delete-text');
      const deleteSpinner = confirmDeleteBtn.querySelector('.delete-spinner');
      if (deleteText) deleteText.style.display = 'none';
      if (deleteSpinner) deleteSpinner.classList.remove('d-none');
      
      try {
        const ok = await deleteMovie(currentDeleteMovie.id);
        if (ok) {
          showToast("Movie deleted", "success");
          loadLibrary(1);
          deleteModal.hide();
        } else {
          showToast("Failed to delete movie", "danger");
        }
      } catch (error) {
        console.error("Delete error:", error);
        showToast("Failed to delete movie", "danger");
      } finally {
        // Reset button state
        confirmDeleteBtn.disabled = false;
        if (deleteText) deleteText.style.display = 'inline-flex';
        if (deleteSpinner) deleteSpinner.classList.add('d-none');
      }
    });
  }

  // Clean up when modal is hidden
  if (deleteModalEl) {
    deleteModalEl.addEventListener('hidden.bs.modal', () => {
      currentDeleteMovie = null;
    });
  }

  // Filtering functionality
  let currentFilters = {};
  let availableGenres = new Set();
  let availableTags = new Set();
  
  // Filter UI elements
  const genreFilter = document.getElementById('genreFilter');
  const yearFromFilter = document.getElementById('yearFromFilter');
  const yearToFilter = document.getElementById('yearToFilter');
  const tagFilter = document.getElementById('tagFilter');
  const ratingFilter = document.getElementById('ratingFilter');
  const applyFiltersBtn = document.getElementById('applyFilters');
  const clearFiltersBtn = document.getElementById('clearFilters');
  
  // Genre checklist elements
  const genreChecklist = document.getElementById('genreChecklist');
  const genreSelectedInfo = document.getElementById('genreSelectedInfo');
  const genreCheckboxes = document.getElementById('genreCheckboxes');
  const clearGenresBtn = document.getElementById('clearGenresBtn');
  const selectedCountSpan = document.querySelector('.selected-count');
  
  // Initialize genre checklist functionality
  let selectedGenres = new Set();
  let allGenres = [];
  
  function initGenreChecklist() {
    if (!genreChecklist) return;
    
    // Clear genres button
    if (clearGenresBtn) {
      clearGenresBtn.addEventListener('click', clearGenreSelection);
    }
  }
  
  function updateGenreOptions(genres) {
    allGenres = genres.sort();
    renderGenreCheckboxes();
    updateSelectedCount();
    syncGenreFilter(); // Keep hidden select in sync
  }
  
  function renderGenreCheckboxes() {
    if (!genreCheckboxes) return;
    
    genreCheckboxes.innerHTML = '';
    
    allGenres.forEach(genre => {
      const item = document.createElement('label');
      item.className = 'genre-checkbox-item';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = genre;
      checkbox.checked = selectedGenres.has(genre);
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedGenres.add(genre);
        } else {
          selectedGenres.delete(genre);
        }
        updateSelectedCount();
        syncGenreFilter();
      });
      
      const customCheckbox = document.createElement('div');
      customCheckbox.className = 'genre-checkbox';
      customCheckbox.innerHTML = `
        <svg class="genre-checkbox-check" width="8" height="8" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
        </svg>
      `;
      
      const label = document.createElement('span');
      label.className = 'genre-checkbox-label';
      label.textContent = genre;
      
      item.appendChild(checkbox);
      item.appendChild(customCheckbox);
      item.appendChild(label);
      genreCheckboxes.appendChild(item);
    });
  }
  
  function updateSelectedCount() {
    if (selectedCountSpan) {
      const count = selectedGenres.size;
      selectedCountSpan.textContent = `${count} genre${count !== 1 ? 's' : ''} selected`;
    }
  }
  
  function syncGenreFilter() {
    // Keep the hidden select in sync for existing filter logic
    if (genreFilter) {
      Array.from(genreFilter.options).forEach(option => {
        option.selected = selectedGenres.has(option.value) && option.value !== '';
      });
    }
  }
  
  function clearGenreSelection() {
    selectedGenres.clear();
    // Uncheck all checkboxes
    const checkboxes = genreCheckboxes.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
    updateSelectedCount();
    syncGenreFilter();
  }
  
  // Update available filters based on current movies
  function updateFilterOptions(movies) {
    // Collect all unique genres and tags
    movies.forEach(movie => {
      if (movie.genres) {
        movie.genres.forEach(genre => availableGenres.add(genre));
      }
    });
    
    // Update custom genre multiselect
    const genreList = Array.from(availableGenres).sort();
    updateGenreOptions(genreList);
    
    // Update hidden genre filter for backwards compatibility
    if (genreFilter) {
      const currentGenres = Array.from(genreFilter.selectedOptions).map(opt => opt.value);
      genreFilter.innerHTML = '<option value="">All Genres</option>';
      genreList.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        if (currentGenres.includes(genre)) {
          option.selected = true;
        }
        genreFilter.appendChild(option);
      });
    }
    
    // Get available tags via API and update tag filter
    if (tagFilter) {
      fetchAvailableTags().then(tags => {
        const currentTags = Array.from(tagFilter.selectedOptions).map(opt => opt.value);
        tagFilter.innerHTML = '<option value="">All Tags</option>';
        tags.forEach(tag => {
          const option = document.createElement('option');
          option.value = tag.name;
          option.textContent = tag.name;
          if (currentTags.includes(tag.name)) {
            option.selected = true;
          }
          tagFilter.appendChild(option);
        });
      });
    }
  }
  
  // Fetch all available tags
  async function fetchAvailableTags() {
    try {
      const predefinedResult = await apiGet('/api/tags/predefined');
      // Also get custom tags by looking at existing movie tags
      // For now, just return predefined tags
      return predefinedResult.tags || [];
    } catch (e) {
      console.error('Failed to fetch tags:', e);
      return [];
    }
  }
  
  // Apply filters and reload library
  async function applyFilters() {
    const filters = {};
    
    // Genre filter
    const selectedGenres = Array.from(genreFilter.selectedOptions)
      .map(opt => opt.value)
      .filter(val => val);
    if (selectedGenres.length > 0) {
      filters.genre = selectedGenres.join(',');
    }
    
    // Year filters
    if (yearFromFilter.value) {
      filters.year_from = yearFromFilter.value;
    }
    if (yearToFilter.value) {
      filters.year_to = yearToFilter.value;
    }
    
    // Tag filter
    const selectedTags = Array.from(tagFilter.selectedOptions)
      .map(opt => opt.value)
      .filter(val => val);
    if (selectedTags.length > 0) {
      filters.tags = selectedTags.join(',');
    }
    
    // Rating filter
    if (ratingFilter.value) {
      filters.min_rating = ratingFilter.value;
    }
    
    currentFilters = filters;
    
    // Update URL params for bookmarkability
    const url = new URL(window.location);
    url.search = '';  // Clear existing params
    Object.keys(filters).forEach(key => {
      url.searchParams.set(key, filters[key]);
    });
    window.history.replaceState({}, '', url);
    
    // Reload library with filters
    await loadLibrary(1);
  }
  
  // Clear all filters
  function clearFilters() {
    // Clear genre checklist
    clearGenreSelection();
    
    if (genreFilter) genreFilter.selectedIndex = 0;
    if (yearFromFilter) yearFromFilter.value = '';
    if (yearToFilter) yearToFilter.value = '';
    if (tagFilter) tagFilter.selectedIndex = 0;
    if (ratingFilter) ratingFilter.selectedIndex = 0;
    
    currentFilters = {};
    
    // Clear URL params
    const url = new URL(window.location);
    url.search = '';
    window.history.replaceState({}, '', url);
    
    loadLibrary(1);
  }
  
  // Load filters from URL on page load
  function loadFiltersFromURL() {
    const url = new URL(window.location);
    
    if (url.searchParams.get('genre')) {
      const genres = url.searchParams.get('genre').split(',');
      // Load into genre checklist
      selectedGenres = new Set(genres);
      
      // Also update the hidden select for compatibility
      if (genreFilter) {
        Array.from(genreFilter.options).forEach(opt => {
          opt.selected = genres.includes(opt.value);
        });
      }
    }
    
    if (url.searchParams.get('year_from') && yearFromFilter) {
      yearFromFilter.value = url.searchParams.get('year_from');
    }
    
    if (url.searchParams.get('year_to') && yearToFilter) {
      yearToFilter.value = url.searchParams.get('year_to');
    }
    
    if (url.searchParams.get('tags') && tagFilter) {
      const tags = url.searchParams.get('tags').split(',');
      Array.from(tagFilter.options).forEach(opt => {
        opt.selected = tags.includes(opt.value);
      });
    }
    
    if (url.searchParams.get('min_rating') && ratingFilter) {
      ratingFilter.value = url.searchParams.get('min_rating');
    }
  }
  
  // Update loadLibrary to use filters
  const originalLoadLibrary = loadLibrary;
  loadLibrary = async function(page) {
    try {
      let url = `/api/movies?page=${page || 1}`;
      
      // Add filter parameters
      Object.keys(currentFilters).forEach(key => {
        url += `&${key}=${encodeURIComponent(currentFilters[key])}`;
      });
      
      const data = await apiGet(url);
      renderLibrary(data.items || []);
      renderPagination(data.total_pages || 1, data.page || 1);
      
      // Update filter options based on all movies (not just filtered results)
      if (page === 1) {
        // Fetch unfiltered movies to get all available options
        const allMoviesData = await apiGet('/api/movies?page=1&per_page=1000');
        updateFilterOptions(allMoviesData.items || []);
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to load library", "danger");
    }
  };
  
  // Event listeners
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', applyFilters);
  }
  
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', clearFilters);
  }
  
  // Load filters from URL on initial page load
  loadFiltersFromURL();

  // Initialize components and app
  if (libraryGrid) {
    // Initialize genre checklist
    initGenreChecklist();
    
    // Initialize the app
    initializeApp();
  }

  // Make functions globally available
  window.removeTag = removeTag;
  window.showDeleteModal = showDeleteModal;
})();
