// Minimal column sorting + filtering for the admin dashboard tables: click a column label to
// sort, use the dropdown below it to filter to one value. No popups, no multi-select — the
// native <select> already gives us search-as-you-type and its own open/close handling for free.
(function () {
  "use strict";

  function compareValues(a, b) {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
  }

  // columns: [{ value, className, filterValue, filterLabel, filterable }]
  //   value: (row) => text shown in the cell (or a plain property key)
  //   filterValue: (row) => raw comparable value used for filtering/sorting (defaults to value).
  //                Numbers should stay numbers here so sorting/filtering works on the real
  //                magnitude, not on a comma-formatted display string.
  //   filterLabel: (row) => text shown in the filter dropdown (defaults to filterValue).
  //   filterable: set to false to leave a column as a plain header (used for "Actions"/"Flags"
  //               columns that aren't backed by a single comparable value).
  // extraCells: renderers for trailing, non-filterable columns (e.g. row action buttons),
  //   appended after `columns` in both the header (left alone) and each rendered row.
  function createFilterableTable({ table, columns, extraCells = [], rowClassName, emptyMessage = "No rows found." }) {
    const headerCells = [...table.tHead.rows[0].cells];
    const tbody = table.tBodies[0];

    const state = { rawRows: [], filters: new Map(), sort: null };
    const selects = new Map();
    const sortIndicators = new Map();

    function displayValue(row, column) {
      return typeof column.value === "function" ? column.value(row) : row[column.value];
    }

    function rawValue(row, column) {
      const getter = column.filterValue || column.value;
      const value = typeof getter === "function" ? getter(row) : row[getter];
      return value === undefined || value === null ? "" : value;
    }

    function groupKey(row, column) {
      return String(rawValue(row, column)).trim();
    }

    function labelFor(row, column) {
      const getter = column.filterLabel;
      if (!getter) return groupKey(row, column) || "(blank)";
      const value = typeof getter === "function" ? getter(row) : row[getter];
      return value === undefined || value === null || value === "" ? "(blank)" : String(value);
    }

    function computeRows() {
      let rows = state.rawRows;

      columns.forEach((column, index) => {
        const selected = state.filters.get(index);
        if (!selected) return;
        rows = rows.filter((row) => groupKey(row, column) === selected);
      });

      if (state.sort) {
        const { index, direction } = state.sort;
        const column = columns[index];
        rows = [...rows].sort((a, b) => compareValues(rawValue(a, column), rawValue(b, column)) * direction);
      }

      return rows;
    }

    function updateSortIndicators() {
      sortIndicators.forEach((span, index) => {
        span.textContent = state.sort && state.sort.index === index ? (state.sort.direction === 1 ? "▲" : "▼") : "";
      });
    }

    function refreshFilterOptions() {
      columns.forEach((column, index) => {
        const select = selects.get(index);
        if (!select) return;

        const labels = new Map();
        state.rawRows.forEach((row) => {
          const key = groupKey(row, column);
          if (!labels.has(key)) labels.set(key, labelFor(row, column));
        });

        const previous = state.filters.get(index) || "";
        select.replaceChildren();

        const allOption = document.createElement("option");
        allOption.value = "";
        allOption.textContent = "All";
        select.append(allOption);

        [...labels.entries()]
          .sort((a, b) => compareValues(a[0], b[0]))
          .forEach(([value, label]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            select.append(option);
          });

        if (previous && !labels.has(previous)) state.filters.delete(index);
        select.value = state.filters.get(index) || "";
      });
    }

    function render() {
      const rows = computeRows();
      const totalColumns = columns.length + extraCells.length;

      if (!rows.length) {
        const message = state.rawRows.length ? "No rows match the current filter." : emptyMessage;
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = totalColumns;
        td.className = "empty-table";
        td.textContent = message;
        tr.append(td);
        tbody.replaceChildren(tr);
      } else {
        const fragment = document.createDocumentFragment();
        rows.forEach((item) => {
          const tr = document.createElement("tr");
          if (rowClassName) {
            const className = rowClassName(item);
            if (className) tr.className = className;
          }

          columns.forEach((column) => {
            const td = document.createElement("td");
            if (column.className) td.className = column.className;
            td.textContent = displayValue(item, column) ?? "";
            tr.append(td);
          });

          extraCells.forEach((build) => tr.append(build(item)));
          fragment.append(tr);
        });
        tbody.replaceChildren(fragment);
      }

      updateSortIndicators();
    }

    function buildHeader() {
      columns.forEach((column, index) => {
        if (column.filterable === false) return;
        const cell = headerCells[index];
        if (!cell) return;

        const originalLabel = cell.textContent.trim();
        cell.textContent = "";
        cell.classList.add("th-filterable");

        const sortButton = document.createElement("button");
        sortButton.type = "button";
        sortButton.className = "th-sort-btn";
        sortButton.append(document.createTextNode(originalLabel));

        const indicator = document.createElement("span");
        indicator.className = "sort-indicator";
        sortButton.append(indicator);
        sortIndicators.set(index, indicator);

        sortButton.addEventListener("click", () => {
          if (!state.sort || state.sort.index !== index) {
            state.sort = { index, direction: 1 };
          } else if (state.sort.direction === 1) {
            state.sort = { index, direction: -1 };
          } else {
            state.sort = null;
          }
          render();
        });

        const select = document.createElement("select");
        select.className = "th-filter-select";
        select.setAttribute("aria-label", `Filter ${originalLabel}`);
        select.addEventListener("change", () => {
          if (select.value) state.filters.set(index, select.value);
          else state.filters.delete(index);
          render();
        });
        selects.set(index, select);

        cell.append(sortButton, select);
      });
    }

    buildHeader();

    return {
      setRows(rows) {
        state.rawRows = Array.isArray(rows) ? rows : [];
        refreshFilterOptions();
        render();
      },
      getVisibleRows() {
        return computeRows();
      },
      clearFilters() {
        state.filters.clear();
        state.sort = null;
        refreshFilterOptions();
        render();
      },
    };
  }

  window.createFilterableTable = createFilterableTable;
})();
