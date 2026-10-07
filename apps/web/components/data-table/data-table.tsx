"use client";

import {
  createColumnHelper,
  createPaginatedRowModel,
  FlexRender,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const dataTableFeatures = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

export type DataTableFeatures = typeof dataTableFeatures;

export function createDataTableColumnHelper<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

type DataTableProps<TData extends RowData> = {
  columns: ColumnDef<DataTableFeatures, TData, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  data: TData[];
  emptyMessage?: React.ReactNode;
  getRowId: (row: TData) => string;
  onRowClick?: (row: TData) => void;
  pageSize?: number;
  toolbar?: React.ReactNode;
};

/** The list view of shadcn-admin-kit, on tanstack table: toolbar, framed table, pager. */
export function DataTable<TData extends RowData>({
  columns,
  data,
  emptyMessage = "Aucun résultat.",
  getRowId,
  onRowClick,
  pageSize = 12,
  toolbar,
}: DataTableProps<TData>) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });
  const [previousData, setPreviousData] = useState(data);

  // Filters produce a new array: go back to the first page (state adjusted during render).
  if (previousData !== data) {
    setPreviousData(data);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    getRowId,
    state: { pagination },
    onPaginationChange: setPagination,
  });
  const pageCount = Math.max(1, table.getPageCount());

  return (
    <div className="flex flex-col gap-4">
      {toolbar}
      <div className="overflow-hidden rounded-xl border bg-card shadow-surface [&_th]:text-muted-foreground [&_thead]:bg-muted/60">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : <FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      <FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {data.length > pagination.pageSize && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {data.length} élément{data.length > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <span className="mr-2 font-medium">
              Page {pagination.pageIndex + 1} sur {pageCount}
            </span>
            <Button variant="outline" size="icon" className="size-8" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
              <ChevronLeftIcon />
              <span className="sr-only">Page précédente</span>
            </Button>
            <Button variant="outline" size="icon" className="size-8" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
              <ChevronRightIcon />
              <span className="sr-only">Page suivante</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
