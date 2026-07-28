/* ==========================================================================
   Apinya Estates — site behaviour
   Vanilla JS, no dependencies. Every feature degrades gracefully without it.
   ========================================================================== */
(function () {
  "use strict";

  var reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /* ----------------------------------------------------------------------
     Header: solid background once the page is scrolled past the hero top
     ---------------------------------------------------------------------- */
  function initHeader() {
    var header = document.querySelector(".site-header");
    if (!header) return;

    var threshold = 40;
    var ticking = false;

    function update() {
      header.classList.toggle("is-stuck", window.scrollY > threshold);
      ticking = false;
    }

    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );

    update();
  }

  /* ----------------------------------------------------------------------
     Mobile navigation drawer
     ---------------------------------------------------------------------- */
  function initNav() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.querySelector(".nav");
    if (!toggle || !nav) return;

    var backdrop = document.createElement("div");
    backdrop.className = "nav-backdrop";
    document.body.appendChild(backdrop);

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      nav.classList.toggle("is-open", open);
      backdrop.classList.toggle("is-visible", open);
      document.body.classList.toggle("nav-open", open);
    }

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    backdrop.addEventListener("click", function () {
      setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });

    // Close after tapping a link, and reset when resizing back to desktop
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 900) setOpen(false);
    });
  }

  /* ----------------------------------------------------------------------
     Scroll reveal
     ---------------------------------------------------------------------- */
  function initReveal() {
    var targets = document.querySelectorAll(".reveal, .reveal-group");
    if (!targets.length) return;

    if (reducedMotion || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(targets, function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );

    Array.prototype.forEach.call(targets, function (el) {
      observer.observe(el);
    });
  }

  /* ----------------------------------------------------------------------
     Animated stat counters
     ---------------------------------------------------------------------- */
  function initCounters() {
    var counters = document.querySelectorAll("[data-count-to]");
    if (!counters.length) return;

    function run(el) {
      var target = parseFloat(el.getAttribute("data-count-to"));
      var suffix = el.getAttribute("data-count-suffix") || "";
      var prefix = el.getAttribute("data-count-prefix") || "";
      var decimals = (el.getAttribute("data-count-to").split(".")[1] || "")
        .length;

      if (reducedMotion) {
        el.textContent = prefix + target.toFixed(decimals) + suffix;
        return;
      }

      var duration = 1400;
      var start = null;

      function step(ts) {
        if (start === null) start = ts;
        var progress = Math.min((ts - start) / duration, 1);
        // easeOutCubic
        var eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
        if (progress < 1) window.requestAnimationFrame(step);
      }

      window.requestAnimationFrame(step);
    }

    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(counters, run);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            run(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    Array.prototype.forEach.call(counters, function (el) {
      observer.observe(el);
    });
  }

  /* ----------------------------------------------------------------------
     Home search bar -> properties page with pre-applied filters
     ---------------------------------------------------------------------- */
  function initSearchBar() {
    var form = document.querySelector("[data-search-form]");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var params = new URLSearchParams();

      Array.prototype.forEach.call(form.querySelectorAll("select"), function (
        field
      ) {
        if (field.value && field.value !== "any") {
          params.set(field.name, field.value);
        }
      });

      var query = params.toString();
      window.location.href = "properties.html" + (query ? "?" + query : "");
    });
  }

  /* ----------------------------------------------------------------------
     Property filtering (properties page)
     ---------------------------------------------------------------------- */
  function initPropertyFilters() {
    var grid = document.querySelector("[data-property-grid]");
    if (!grid) return;

    var cards = Array.prototype.slice.call(
      grid.querySelectorAll("[data-property]")
    );
    var buttons = Array.prototype.slice.call(
      document.querySelectorAll("[data-filter]")
    );
    var countEl = document.querySelector("[data-filter-count]");
    var emptyEl = document.querySelector("[data-empty-state]");
    var selects = Array.prototype.slice.call(
      document.querySelectorAll("[data-filter-select]")
    );
    var sortSelect = document.querySelector("[data-sort-select]");

    // Original document order, used to restore the "featured" sort
    var featuredOrder = cards.slice();

    var state = { type: "all", location: "any", budget: "any", beds: "any" };

    function num(card, attr) {
      return parseInt(card.getAttribute(attr), 10) || 0;
    }

    function sort(mode) {
      var ordered;

      if (mode === "price-asc") {
        ordered = cards.slice().sort(function (a, b) {
          return num(a, "data-price") - num(b, "data-price");
        });
      } else if (mode === "price-desc") {
        ordered = cards.slice().sort(function (a, b) {
          return num(b, "data-price") - num(a, "data-price");
        });
      } else if (mode === "beds-desc") {
        ordered = cards.slice().sort(function (a, b) {
          return num(b, "data-beds") - num(a, "data-beds");
        });
      } else {
        ordered = featuredOrder;
      }

      // Re-appending in the desired order is enough; the grid follows the DOM.
      ordered.forEach(function (card) {
        grid.appendChild(card);
      });
    }

    function matchesBudget(price, budget) {
      if (budget === "any") return true;
      var n = parseInt(price, 10);
      if (budget === "under-10") return n < 10000000;
      if (budget === "10-25") return n >= 10000000 && n <= 25000000;
      if (budget === "25-50") return n > 25000000 && n <= 50000000;
      if (budget === "50-plus") return n > 50000000;
      return true;
    }

    function apply() {
      var visible = 0;

      cards.forEach(function (card) {
        var okType =
          state.type === "all" || card.getAttribute("data-type") === state.type;
        var okLocation =
          state.location === "any" ||
          card.getAttribute("data-location") === state.location;
        var okBudget = matchesBudget(
          card.getAttribute("data-price"),
          state.budget
        );
        var okBeds =
          state.beds === "any" ||
          parseInt(card.getAttribute("data-beds"), 10) >=
            parseInt(state.beds, 10);

        var show = okType && okLocation && okBudget && okBeds;
        card.classList.toggle("is-hidden", !show);
        if (show) visible++;
      });

      if (countEl) {
        countEl.textContent =
          visible + (visible === 1 ? " property" : " properties");
      }
      if (emptyEl) emptyEl.hidden = visible !== 0;
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.type = btn.getAttribute("data-filter");
        buttons.forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === btn));
        });
        apply();
      });
    });

    selects.forEach(function (select) {
      select.addEventListener("change", function () {
        state[select.getAttribute("data-filter-select")] = select.value;
        apply();
      });
    });

    if (sortSelect) {
      sortSelect.addEventListener("change", function () {
        sort(sortSelect.value);
      });
    }

    // Pre-apply filters coming from the homepage search bar
    var params = new URLSearchParams(window.location.search);
    ["type", "location", "budget", "beds"].forEach(function (key) {
      var value = params.get(key);
      if (!value) return;

      if (key === "type") {
        var btn = buttons.filter(function (b) {
          return b.getAttribute("data-filter") === value;
        })[0];
        if (btn) {
          state.type = value;
          buttons.forEach(function (b) {
            b.setAttribute("aria-pressed", String(b === btn));
          });
        }
      } else {
        var select = selects.filter(function (s) {
          return s.getAttribute("data-filter-select") === key;
        })[0];
        if (select) {
          select.value = value;
          state[key] = value;
        }
      }
    });

    apply();
  }

  /* ----------------------------------------------------------------------
     Contact form validation
     ---------------------------------------------------------------------- */
  function initContactForm() {
    var form = document.querySelector("[data-contact-form]");
    if (!form) return;

    var status = form.querySelector("[data-form-status]");

    function fieldError(input) {
      var wrapper = input.closest(".field");
      return wrapper ? wrapper.querySelector(".field__error") : null;
    }

    function validate(input) {
      var message = "";
      var value = input.value.trim();

      if (input.hasAttribute("required") && !value) {
        message = "This field is required.";
      } else if (input.type === "email" && value) {
        // Deliberately permissive: catches typos, not exotic-but-valid addresses
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
          message = "Please enter a valid email address.";
        }
      }

      var errorEl = fieldError(input);
      if (errorEl) errorEl.textContent = message;
      input.setAttribute("aria-invalid", message ? "true" : "false");
      return !message;
    }

    var inputs = Array.prototype.slice.call(
      form.querySelectorAll("input, textarea, select")
    );

    inputs.forEach(function (input) {
      input.addEventListener("blur", function () {
        validate(input);
      });
      input.addEventListener("input", function () {
        if (input.getAttribute("aria-invalid") === "true") validate(input);
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var valid = true;
      var firstInvalid = null;

      inputs.forEach(function (input) {
        if (!validate(input)) {
          valid = false;
          if (!firstInvalid) firstInvalid = input;
        }
      });

      if (!valid) {
        if (firstInvalid) firstInvalid.focus();
        if (status) {
          status.hidden = false;
          status.textContent =
            "Please correct the highlighted fields and try again.";
        }
        return;
      }

      // No backend wired up yet — see README for how to connect one.
      if (status) {
        status.hidden = false;
        status.textContent =
          "Thank you — your enquiry has been recorded. Apinya will reply within one business day.";
        status.focus();
      }
      form.reset();
    });
  }

  /* ----------------------------------------------------------------------
     Footer year
     ---------------------------------------------------------------------- */
  function initYear() {
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-year]"),
      function (el) {
        el.textContent = new Date().getFullYear();
      }
    );
  }

  /* ----------------------------------------------------------------------
     Boot
     ---------------------------------------------------------------------- */
  function init() {
    initHeader();
    initNav();
    initReveal();
    initCounters();
    initSearchBar();
    initPropertyFilters();
    initContactForm();
    initYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
