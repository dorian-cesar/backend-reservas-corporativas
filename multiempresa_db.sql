create table empresas
(
    id                    int auto_increment
        primary key,
    nombre                varchar(150)               not null,
    estado                tinyint(1)    default 1    null,
    recargo               int           default 0    null,
    porcentaje_devolucion decimal(5, 2) default 0.00 null,
    dia_facturacion       int                        null,
    dia_vencimiento       int                        null
);

create table centros_costo
(
    id         int auto_increment
        primary key,
    nombre     varchar(150)         not null,
    empresa_id int                  not null,
    estado     tinyint(1) default 1 null,
    created_at datetime             null,
    updated_at datetime             null,
    constraint centros_costo_ibfk_1
        foreign key (empresa_id) references empresas (id)
            on update cascade on delete cascade
);

create index empresa_id
    on centros_costo (empresa_id);

create table cuenta_corriente
(
    id               int auto_increment
        primary key,
    empresa_id       int                     not null,
    fecha_movimiento datetime                null,
    tipo_movimiento  enum ('abono', 'cargo') not null,
    monto            decimal(12, 2)          not null,
    descripcion      varchar(255)            null,
    saldo            decimal(12, 2)          not null,
    referencia       varchar(100)            null,
    constraint cuenta_corriente_ibfk_1
        foreign key (empresa_id) references empresas (id)
            on update cascade on delete cascade
);

create index empresa_id
    on cuenta_corriente (empresa_id);

create table estados_cuenta
(
    id                     int auto_increment
        primary key,
    empresa_id             int                  not null,
    periodo                varchar(7)           not null,
    fecha_generacion       datetime             not null,
    total_tickets          int                  not null,
    total_tickets_anulados int                  not null,
    monto_facturado        decimal(12, 2)       not null,
    detalle_por_cc         text                 not null,
    pagado                 tinyint(1) default 0 null,
    fecha_pago             datetime             null,
    constraint estados_cuenta_ibfk_1
        foreign key (empresa_id) references empresas (id)
            on update cascade
);

create index empresa_id
    on estados_cuenta (empresa_id);

create table users
(
    id              int auto_increment
        primary key,
    nombre          varchar(150)                                                                                     not null,
    rut             varchar(50)                                                                                      null,
    email           varchar(150)                                                                                     not null,
    password        varchar(255)                                                                                     not null,
    rol             enum ('superuser', 'admin', 'empresa', 'subusuario', 'auditoria', 'contralor') default 'empresa' null,
    empresa_id      int                                                                                              null,
    estado          tinyint(1)                                                                     default 1         null,
    centro_costo_id int                                                                                              null,
    created_at      datetime                                                                                         null,
    updated_at      datetime                                                                                         null,
    constraint email
        unique (email),
    constraint email_2
        unique (email),
    constraint email_3
        unique (email),
    constraint email_4
        unique (email),
    constraint users_ibfk_7
        foreign key (empresa_id) references empresas (id)
            on update cascade on delete set null,
    constraint users_ibfk_8
        foreign key (centro_costo_id) references centros_costo (id)
            on update cascade on delete set null
);

create table tickets
(
    id               int auto_increment
        primary key,
    ticketNumber     varchar(50)                   not null,
    ticketStatus     enum ('Confirmed', 'Anulado') not null,
    origin           varchar(100)                  not null,
    destination      varchar(100)                  not null,
    travelDate       date                          not null,
    departureTime    varchar(20)                   not null,
    seatNumbers      varchar(20)                   not null,
    fare             int                           not null,
    monto_boleto     int                           not null,
    confirmedAt      datetime                      not null,
    id_User          int                           not null,
    created_at       datetime                      null,
    updated_at       datetime                      null,
    monto_devolucion int default 0                 not null,
    constraint ticketNumber
        unique (ticketNumber),
    constraint ticketNumber_2
        unique (ticketNumber),
    constraint ticketNumber_3
        unique (ticketNumber),
    constraint ticketNumber_4
        unique (ticketNumber),
    constraint tickets_ibfk_1
        foreign key (id_User) references users (id)
            on update cascade
);

create index id_User
    on tickets (id_User);

create index centro_costo_id
    on users (centro_costo_id);

create index empresa_id
    on users (empresa_id);

