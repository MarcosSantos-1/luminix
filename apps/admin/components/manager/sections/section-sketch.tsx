'use client'

import { Button, Card, Chip, Table } from '@heroui/react'
import type { SectionSketch } from '../demo-data'

export function SectionSketchView({
  sketch,
  createLabel,
  onAction,
}: {
  sketch: SectionSketch
  createLabel: string
  onAction: (label: string) => void
}) {
  return (
    <div className="manager-section">
      <div className="manager-stats" aria-label="Indicadores ilustrativos">
        {sketch.stats.map((stat) => (
          <div key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.detail}</small>
          </div>
        ))}
      </div>
      <div className="manager-section-toolbar">
        <Button onPress={() => onAction(createLabel)}>{createLabel}</Button>
        <Button variant="secondary" onPress={() => onAction('Filtrar')}>
          Filtrar
        </Button>
        <Button variant="ghost" onPress={() => onAction('Ver detalhes')}>
          Ver detalhes
        </Button>
      </div>
      <Card className="manager-panel">
        <Card.Header className="manager-panel-heading">
          <Card.Title>Exemplos</Card.Title>
          <Chip size="sm" variant="soft">
            Ilustrativo
          </Chip>
        </Card.Header>
        <Card.Content>
          <Table className="manager-table" variant="secondary">
            <Table.ScrollContainer>
              <Table.Content aria-label="Exemplos ilustrativos">
                <Table.Header>
                  {sketch.columns.map((column) => (
                    <Table.Column key={column.id} id={column.id} isRowHeader={column.rowHeader}>
                      {column.label}
                    </Table.Column>
                  ))}
                </Table.Header>
                <Table.Body>
                  {sketch.rows.map((row) => (
                    <Table.Row key={row.id} id={row.id}>
                      <Table.Cell>{row.primary}</Table.Cell>
                      <Table.Cell>{row.secondary}</Table.Cell>
                      <Table.Cell>{row.meta}</Table.Cell>
                      <Table.Cell>
                        <Chip size="sm" variant="soft">
                          {row.status}
                        </Chip>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Card.Content>
      </Card>
      <Card className="manager-panel manager-placeholder">
        <Card.Header>
          <Card.Title>{sketch.emptyTitle}</Card.Title>
        </Card.Header>
        <Card.Content className="manager-placeholder-copy">
          <p>{sketch.emptyDetail}</p>
          <Button onPress={() => onAction(createLabel)}>{createLabel}</Button>
        </Card.Content>
      </Card>
    </div>
  )
}
