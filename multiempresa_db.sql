create table multiempresa_db.empresas
(
    id                    int auto_increment primary key,
    nombre                varchar(150)         not null,
    estado                tinyint(1) default 1 not null,
    recargo               int        default 0 not null,
    porcentaje_devolucion decimal(5,2) default 0.00 not null
);

create table multiempresa_db.centros_costo
(
    id          int auto_increment primary key,
    nombre      varchar(150) not null,
    empresa_id  int not null,
    estado      tinyint(1) default 1 not null,
    created_at  timestamp default CURRENT_TIMESTAMP null,
    updated_at  timestamp default CURRENT_TIMESTAMP null on update CURRENT_TIMESTAMP,
    foreign key (empresa_id) references empresas(id)
);

create table multiempresa_db.users
(
    id              int auto_increment primary key,
    nombre          varchar(150) not null,
    rut             varchar(50) null,
    email           varchar(150) not null,
    password        varchar(255) not null,
    rol             enum ('admin', 'empresa', 'subusuario', 'auditoria', 'contralor') default 'empresa' not null,
    empresa_id      int null,
    centro_costo_id int null,
    created_at      timestamp default CURRENT_TIMESTAMP null,
    updated_at      timestamp default CURRENT_TIMESTAMP null on update CURRENT_TIMESTAMP,
    constraint email unique (email),
    foreign key (empresa_id) references empresas(id),
    foreign key (centro_costo_id) references centros_costo(id)
);

create table multiempresa_db.cuenta_corriente
(
    id              int auto_increment primary key,
    empresa_id      int not null,
    fecha_movimiento timestamp default CURRENT_TIMESTAMP not null,
    tipo_movimiento enum('abono', 'cargo') not null,
    monto           decimal(12,2) not null,
    descripcion     varchar(255) null,
    saldo           decimal(12,2) not null,
    referencia      varchar(100) null, -- por ejemplo, id de pasaje, EDP, etc.
    foreign key (empresa_id) references empresas(id)
);
