const ACTIVE_RIDE_STATUSES = ["pending", "accepted", "arrived", "on_trip"];
const OPEN_SCHEDULED_STATUSES = ["scheduled", "dispatching"];
const PAYMENT_FOLLOW_UP_OPEN_STATUSES = ["customer_paying_soon", "under_review"];

const DRIVER_PROFILE_SELECT = [
  "id",
  "full_name",
  "email",
  "phone",
  "role",
  "driver_type",
  "gender",
  "dob",
  "is_online",
  "is_verified",
  "avatar_url",
  "nin_number",
  "license_number",
  "license_expiry",
  "license_photo_url",
  "license_selfie_url",
  "emergency_contact",
  "updated_at",
  "has_paid",
  "vehicle_category",
  "rating",
  "total_trips",
  "subscription_expires_at",
  "is_busy",
  "last_online_at",
  "total_online_minutes",
  "total_kilometers",
  "lifetime_online_minutes",
].join(",");

const CUSTOMER_PROFILE_SELECT = [
  "id",
  "full_name",
  "email",
  "phone",
  "role",
  "gender",
  "dob",
  "is_verified",
  "avatar_url",
  "updated_at",
  "rating",
  "total_trips",
].join(",");

const VEHICLE_SELECT = [
  "id",
  "driver_id",
  "category",
  "make",
  "model",
  "color",
  "production_year",
  "plate_number",
  "registration_photo_url",
  "vehicle_image_url",
  "capacity_kg",
  "is_active",
].join(",");

const RIDE_SELECT = [
  "id",
  "customer_id",
  "driver_id",
  "status",
  "is_delivery",
  "pickup_address",
  "destination_address",
  "price",
  "created_at",
  "completed_at",
  "accepted_at",
  "started_at",
  "updated_at",
  "requested_vehicle_type",
  "service_type_id",
  "distance_km",
  "route_distance_km",
  "driver_pickup_distance_km",
  "estimated_pickup_mins",
  "estimated_dropoff_mins",
  "driver_confirmed_departure",
  "paymentMode",
  "payment_status",
  "settlement_status",
  "payment_follow_up_status",
  "payment_follow_up_note",
  "payment_follow_up_reported_at",
  "dropoff_arrived_at",
  "partner_id",
  "source_code",
  "attribution_source",
  "customer_payment_id",
  "customer:profiles!customer_id(id,full_name,phone,email,is_verified,rating,total_trips)",
  "driver:profiles!driver_id(id,full_name,phone,email,is_verified,has_paid,is_online,is_busy,rating,subscription_expires_at)",
  "service:service_types(id,label,name,description,is_active,sort_order,capacity)",
].join(",");

const SCHEDULED_RIDE_SELECT = [
  "id",
  "customer_id",
  "spawned_ride_id",
  "status",
  "pickup_address",
  "destination_address",
  "pickup_lat",
  "pickup_lon",
  "destination_lat",
  "destination_lon",
  "requested_vehicle_type",
  "service_type_id",
  "scheduled_for",
  "dispatch_lead_minutes",
  "quoted_price",
  "quoted_distance_km",
  "quoted_estimated_pickup_mins",
  "quoted_estimated_dropoff_mins",
  "quoted_driver_pickup_distance_km",
  "quoted_eta_source",
  "quoted_eta_last_calculated_at",
  "quoted_routing_provider",
  "quoted_routing_preference",
  "dispatch_attempts",
  "last_dispatch_error",
  "dispatched_at",
  "cancelled_at",
  "created_at",
  "updated_at",
  "customer:profiles!customer_id(id,full_name,phone,email,is_verified,total_trips,rating)",
  "service:service_types(id,label,name,is_active,sort_order,capacity)",
].join(",");

const DRIVER_LOCATION_SELECT = [
  "driver_id",
  "driver_lat",
  "driver_lon",
  "heading",
  "last_updated",
].join(",");

const OPEN_OFFER_SELECT = [
  "id",
  "ride_id",
  "driver_id",
  "status",
  "round",
  "offered_at",
  "expires_at",
  "updated_at",
  "metadata",
].join(",");

const toArray = (value) => (Array.isArray(value) ? value : []);

const toIdList = (rows, key = "id") =>
  Array.from(
    new Set(
      toArray(rows)
        .map((row) => row?.[key])
        .filter(Boolean),
    ),
  );

const inFilter = (values) => `in.(${values.join(",")})`;

const buildSearchMatcher = (search) => {
  const normalized = String(search || "").trim().toLowerCase();
  if (!normalized) {
    return () => true;
  }

  return (value) => String(value || "").toLowerCase().includes(normalized);
};

const indexBy = (rows, key) => {
  const result = new Map();

  for (const row of toArray(rows)) {
    const id = row?.[key];
    if (id) {
      result.set(id, row);
    }
  }

  return result;
};

const groupBy = (rows, key) => {
  const result = new Map();

  for (const row of toArray(rows)) {
    const id = row?.[key];
    if (!id) {
      continue;
    }

    if (!result.has(id)) {
      result.set(id, []);
    }

    result.get(id).push(row);
  }

  return result;
};

const sumBy = (rows, key, predicate = () => true) =>
  toArray(rows).reduce((sum, row) => {
    if (!predicate(row)) {
      return sum;
    }

    const nextValue = Number(row?.[key] ?? 0);
    return Number.isFinite(nextValue) ? sum + nextValue : sum;
  }, 0);

const sortByDateDesc = (rows, key) =>
  [...toArray(rows)].sort(
    (left, right) =>
      new Date(right?.[key] || 0).getTime() - new Date(left?.[key] || 0).getTime(),
  );

const buildDriverActivationState = (driver) => {
  const subscriptionExpiry = driver?.subscription_expires_at
    ? new Date(driver.subscription_expires_at).getTime()
    : 0;
  const now = Date.now();

  if (!driver?.is_verified) {
    return "pending_verification";
  }

  if (!driver?.has_paid) {
    return "awaiting_subscription";
  }

  if (subscriptionExpiry && subscriptionExpiry < now) {
    return "subscription_expired";
  }

  return "active";
};

const mapConfigRows = (rows) =>
  toArray(rows).reduce((accumulator, row) => {
    accumulator[row.key] = row;
    return accumulator;
  }, {});

const safeSelect = async (executor) => {
  try {
    return await executor();
  } catch {
    return [];
  }
};

const safeSelectOne = async (executor) => {
  try {
    return await executor();
  } catch {
    return null;
  }
};

export const getDispatchSettings = async (admin, dispatchAdminToken) => {
  if (dispatchAdminToken) {
    try {
      const { data } = await admin.invokeFunction("dispatch-settings", {
        headers: {
          "x-dispatch-admin-token": dispatchAdminToken,
        },
        method: "GET",
      });

      return data?.data || null;
    } catch {
      // Fall back to raw config storage below.
    }
  }

  const row = await safeSelectOne(() =>
    admin.selectOne("app_dispatch_configs", {
      key: "eq.defaults",
      select: "key,value,updated_at",
    }),
  );

  return row?.value || null;
};

export const getOverviewData = async (admin, config) => {
  const [driverCount, verifiedDriverCount, paidDriverCount, onlineDriverCount] =
    await Promise.all([
      admin.count("profiles", { role: "eq.driver" }),
      admin.count("profiles", { role: "eq.driver", is_verified: "eq.true" }),
      admin.count("profiles", { role: "eq.driver", has_paid: "eq.true" }),
      admin.count("profiles", { role: "eq.driver", is_online: "eq.true" }),
    ]);

  const [
    customerCount,
    activeRideCount,
    scheduledRideCount,
    openOfferCount,
    unresolvedReportCount,
    partnerCount,
    paymentFollowUpCount,
  ] = await Promise.all([
    admin.count("profiles", { role: "eq.customer" }),
    admin.count("rides", { status: inFilter(ACTIVE_RIDE_STATUSES) }),
    admin.count("scheduled_rides", { status: inFilter(OPEN_SCHEDULED_STATUSES) }),
    admin.count("ride_offers", { status: "eq.offered" }),
    admin.count("reports", { status: "eq.pending" }),
    admin.count("partners", { status: "eq.active" }),
    admin.count("rides", {
      payment_follow_up_status: inFilter(PAYMENT_FOLLOW_UP_OPEN_STATUSES),
    }),
  ]);

  const [recentRides, configRows, dispatchSettings, recentPayments, wallets] =
    await Promise.all([
      admin.select("rides", {
        limit: 8,
        order: "created_at.desc",
        select: RIDE_SELECT,
      }),
      admin.select("app_configs", {
        key: "in.(driver_monthly_fee,hybrid_finance_settings)",
        order: "key.asc",
        select: "key,description,value,updated_at",
      }),
      getDispatchSettings(admin, config.dispatchAdminToken),
      safeSelect(() =>
        admin.select("customer_payments", {
          limit: 12,
          order: "created_at.desc",
          select:
            "id,ride_id,customer_id,amount,currency,status,payment_method,provider,provider_reference,created_at,paid_at",
        }),
      ),
      safeSelect(() =>
        admin.select("driver_wallets", {
          order: "updated_at.desc",
          select:
            "driver_id,available_balance,pending_balance,auto_withdraw_enabled,auto_withdraw_minimum_amount,updated_at",
        }),
      ),
    ]);

  const configMap = mapConfigRows(configRows);
  const walletAvailableTotal = sumBy(wallets, "available_balance");
  const walletPendingTotal = sumBy(wallets, "pending_balance");
  const paidPaymentCount = recentPayments.filter(
    (payment) => payment.status === "paid",
  ).length;

  const alerts = [
    {
      level: paymentFollowUpCount > 0 ? "warning" : "ok",
      label: "Trips waiting on payment follow-up",
      value: paymentFollowUpCount,
    },
    {
      level: unresolvedReportCount > 0 ? "warning" : "ok",
      label: "Pending support reports",
      value: unresolvedReportCount,
    },
    {
      level: verifiedDriverCount < driverCount ? "attention" : "ok",
      label: "Drivers still awaiting verification",
      value: Math.max(0, driverCount - verifiedDriverCount),
    },
    {
      level: paidDriverCount < verifiedDriverCount ? "attention" : "ok",
      label: "Verified drivers awaiting subscription payment",
      value: Math.max(0, verifiedDriverCount - paidDriverCount),
    },
  ];

  return {
    alerts,
    counts: {
      activeRides: activeRideCount,
      customers: customerCount,
      drivers: driverCount,
      onlineDrivers: onlineDriverCount,
      openOffers: openOfferCount,
      partners: partnerCount,
      scheduledRides: scheduledRideCount,
      subscribedDrivers: paidDriverCount,
      unresolvedReports: unresolvedReportCount,
      verifiedDrivers: verifiedDriverCount,
    },
    dispatchSettings,
    finance: {
      driverMonthlyFee: configMap.driver_monthly_fee?.value || null,
      hybridFinanceSettings: configMap.hybrid_finance_settings?.value || null,
      paidPaymentCount,
      walletAvailableTotal,
      walletPendingTotal,
    },
    recentRides,
  };
};

export const getLiveOpsData = async (admin) => {
  const [activeRides, scheduledRides, openOffers, onlineDrivers, driverLocations, reports] =
    await Promise.all([
      admin.select("rides", {
        limit: 24,
        order: "created_at.desc",
        select: RIDE_SELECT,
        status: inFilter(ACTIVE_RIDE_STATUSES),
      }),
      safeSelect(() =>
        admin.select("scheduled_rides", {
          limit: 20,
          order: "scheduled_for.asc",
          select: SCHEDULED_RIDE_SELECT,
          status: inFilter(OPEN_SCHEDULED_STATUSES),
        }),
      ),
      admin.select("ride_offers", {
        limit: 30,
        order: "offered_at.desc",
        select: OPEN_OFFER_SELECT,
        status: "eq.offered",
      }),
      admin.select("profiles", {
        limit: 40,
        order: "last_online_at.desc",
        role: "eq.driver",
        is_online: "eq.true",
        select: DRIVER_PROFILE_SELECT,
      }),
      admin.select("driver_locations", {
        limit: 80,
        order: "last_updated.desc",
        select: DRIVER_LOCATION_SELECT,
      }),
      admin.select("reports", {
        limit: 12,
        order: "created_at.desc",
        select:
          "id,ride_id,reporter_id,target_id,issue_category,description,status,created_at",
      }),
    ]);

  const onlineDriverIds = toIdList(onlineDrivers);
  const [vehicles, wallets] = await Promise.all([
    onlineDriverIds.length
      ? admin.select("vehicles", {
          driver_id: inFilter(onlineDriverIds),
          select: VEHICLE_SELECT,
        })
      : Promise.resolve([]),
    onlineDriverIds.length
      ? safeSelect(() =>
          admin.select("driver_wallets", {
            driver_id: inFilter(onlineDriverIds),
            select:
              "driver_id,available_balance,pending_balance,auto_withdraw_enabled,auto_withdraw_minimum_amount,updated_at",
          }),
        )
      : Promise.resolve([]),
  ]);

  const locationByDriverId = indexBy(driverLocations, "driver_id");
  const vehicleByDriverId = indexBy(vehicles, "driver_id");
  const walletByDriverId = indexBy(wallets, "driver_id");

  return {
    activeRides,
    openOffers,
    onlineDrivers: onlineDrivers.map((driver) => ({
      ...driver,
      activation_state: buildDriverActivationState(driver),
      location: locationByDriverId.get(driver.id) || null,
      vehicle: vehicleByDriverId.get(driver.id) || null,
      wallet: walletByDriverId.get(driver.id) || null,
    })),
    reports,
    scheduledRides,
  };
};

export const getRidesData = async (admin, filters = {}) => {
  const params = {
    limit: Math.min(Number(filters.limit) || 120, 250),
    order: "created_at.desc",
    select: RIDE_SELECT,
  };

  if (filters.status && filters.status !== "all") {
    params.status = filters.status.includes(",")
      ? inFilter(filters.status.split(",").map((value) => value.trim()))
      : `eq.${filters.status}`;
  }

  if (filters.paymentStatus && filters.paymentStatus !== "all") {
    params.payment_status = `eq.${filters.paymentStatus}`;
  }

  if (filters.serviceTypeId && filters.serviceTypeId !== "all") {
    params.service_type_id = `eq.${filters.serviceTypeId}`;
  }

  const rows = await admin.select("rides", params);
  const matchesSearch = buildSearchMatcher(filters.search);

  return rows.filter((ride) => {
    if (!filters.search) {
      return true;
    }

    return [
      ride.id,
      ride.pickup_address,
      ride.destination_address,
      ride.customer?.full_name,
      ride.customer?.phone,
      ride.driver?.full_name,
      ride.driver?.phone,
    ].some(matchesSearch);
  });
};

export const cancelRideAsAdmin = async (admin, rideId, payload = {}) => {
  const now = new Date().toISOString();
  const updates = await admin.update(
    "rides",
    {
      status: "cancelled",
      updated_at: now,
    },
    {
      id: `eq.${rideId}`,
      select: RIDE_SELECT,
    },
  );

  await safeSelect(() =>
    admin.update(
      "ride_offers",
      {
        status: "unavailable",
        updated_at: now,
      },
      {
        ride_id: `eq.${rideId}`,
        status: "eq.offered",
        select: "id",
      },
    ),
  );

  await safeSelect(() =>
    admin.insert("ride_cancellation_logs", {
      ride_id: rideId,
      user_id: null,
      role: "admin",
      reason: payload.reason || "Cancelled from Drop admin dashboard",
    }),
  );

  return updates[0] || null;
};

export const updateRideFollowUp = async (admin, rideId, payload = {}) => {
  const nextPayload = {
    updated_at: new Date().toISOString(),
  };

  if (payload.payment_follow_up_status) {
    nextPayload.payment_follow_up_status = payload.payment_follow_up_status;
  }

  if (payload.payment_follow_up_note !== undefined) {
    nextPayload.payment_follow_up_note = payload.payment_follow_up_note || null;
  }

  if (payload.payment_follow_up_reported_at !== undefined) {
    nextPayload.payment_follow_up_reported_at =
      payload.payment_follow_up_reported_at || null;
  }

  if (payload.paymentMode) {
    nextPayload.paymentMode = payload.paymentMode;
  }

  const updates = await admin.update("rides", nextPayload, {
    id: `eq.${rideId}`,
    select: RIDE_SELECT,
  });

  return updates[0] || null;
};

export const getDriversData = async (admin, filters = {}) => {
  const drivers = await admin.select("profiles", {
    limit: Math.min(Number(filters.limit) || 180, 300),
    order: "updated_at.desc",
    role: "eq.driver",
    select: DRIVER_PROFILE_SELECT,
  });

  const driverIds = toIdList(drivers);
  const [vehicles, locations, wallets, payoutAccounts, payouts] = await Promise.all([
    driverIds.length
      ? admin.select("vehicles", {
          driver_id: inFilter(driverIds),
          select: VEHICLE_SELECT,
        })
      : Promise.resolve([]),
    driverIds.length
      ? admin.select("driver_locations", {
          driver_id: inFilter(driverIds),
          select: DRIVER_LOCATION_SELECT,
        })
      : Promise.resolve([]),
    driverIds.length
      ? safeSelect(() =>
          admin.select("driver_wallets", {
            driver_id: inFilter(driverIds),
            select:
              "driver_id,available_balance,pending_balance,auto_withdraw_enabled,auto_withdraw_minimum_amount,updated_at",
          }),
        )
      : Promise.resolve([]),
    driverIds.length
      ? safeSelect(() =>
          admin.select("driver_payout_accounts", {
            driver_id: inFilter(driverIds),
            order: "updated_at.desc",
            select:
              "id,driver_id,bank_name,bank_code,account_number,account_name,is_default,provider,provider_email,recipient_reference,sub_account_code,settlement_profile_code,settlement_report_emails,updated_at",
          }),
        )
      : Promise.resolve([]),
    driverIds.length
      ? safeSelect(() =>
          admin.select("driver_payouts", {
            driver_id: inFilter(driverIds),
            order: "requested_at.desc",
            limit: 120,
            select:
              "id,driver_id,payout_account_id,amount,provider,provider_reference,status,failure_reason,requested_at,completed_at,ride_id",
          }),
        )
      : Promise.resolve([]),
  ]);

  const matchesSearch = buildSearchMatcher(filters.search);
  const vehicleByDriverId = indexBy(vehicles, "driver_id");
  const locationByDriverId = indexBy(locations, "driver_id");
  const walletByDriverId = indexBy(wallets, "driver_id");
  const payoutAccountsByDriverId = groupBy(payoutAccounts, "driver_id");
  const payoutsByDriverId = groupBy(payouts, "driver_id");

  return drivers
    .map((driver) => {
      const accounts = payoutAccountsByDriverId.get(driver.id) || [];
      const recentPayouts = payoutsByDriverId.get(driver.id) || [];

      return {
        ...driver,
        activation_state: buildDriverActivationState(driver),
        default_payout_account:
          accounts.find((account) => account.is_default) || accounts[0] || null,
        location: locationByDriverId.get(driver.id) || null,
        payout_accounts: accounts,
        recent_payouts: recentPayouts.slice(0, 4),
        vehicle: vehicleByDriverId.get(driver.id) || null,
        wallet: walletByDriverId.get(driver.id) || null,
      };
    })
    .filter((driver) => {
      if (!filters.search) {
        return true;
      }

      return [
        driver.id,
        driver.full_name,
        driver.phone,
        driver.email,
        driver.vehicle?.plate_number,
        driver.vehicle?.make,
        driver.vehicle?.model,
      ].some(matchesSearch);
    });
};

export const updateDriver = async (admin, driverId, payload = {}) => {
  const nextPayload = {
    updated_at: new Date().toISOString(),
  };

  const allowedFields = [
    "full_name",
    "email",
    "phone",
    "is_online",
    "is_verified",
    "has_paid",
    "vehicle_category",
    "driver_type",
    "is_busy",
    "subscription_expires_at",
  ];

  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      nextPayload[field] = payload[field];
    }
  }

  if (payload.has_paid === false && payload.subscription_expires_at === undefined) {
    nextPayload.subscription_expires_at = null;
  }

  const updates = await admin.update("profiles", nextPayload, {
    id: `eq.${driverId}`,
    role: "eq.driver",
    select: DRIVER_PROFILE_SELECT,
  });

  return updates[0] || null;
};

export const getCustomersData = async (admin, filters = {}) => {
  const customers = await admin.select("profiles", {
    limit: Math.min(Number(filters.limit) || 180, 300),
    order: "updated_at.desc",
    role: "eq.customer",
    select: CUSTOMER_PROFILE_SELECT,
  });

  const customerIds = toIdList(customers);
  const rides = customerIds.length
    ? await admin.select("rides", {
        customer_id: inFilter(customerIds),
        limit: 250,
        order: "created_at.desc",
        select:
          "id,customer_id,driver_id,status,pickup_address,destination_address,price,created_at,completed_at,payment_status,payment_follow_up_status",
      })
    : [];

  const ridesByCustomerId = groupBy(rides, "customer_id");
  const matchesSearch = buildSearchMatcher(filters.search);

  return customers
    .map((customer) => {
      const customerRides = ridesByCustomerId.get(customer.id) || [];
      const activeRide =
        customerRides.find((ride) => ACTIVE_RIDE_STATUSES.includes(ride.status)) || null;

      return {
        ...customer,
        active_ride: activeRide,
        recent_rides: customerRides.slice(0, 4),
        latest_ride: customerRides[0] || null,
      };
    })
    .filter((customer) => {
      if (!filters.search) {
        return true;
      }

      return [customer.id, customer.full_name, customer.phone, customer.email].some(
        matchesSearch,
      );
    });
};

export const updateCustomer = async (admin, customerId, payload = {}) => {
  const nextPayload = {
    updated_at: new Date().toISOString(),
  };

  const allowedFields = ["full_name", "email", "phone", "is_verified"];
  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      nextPayload[field] = payload[field];
    }
  }

  const updates = await admin.update("profiles", nextPayload, {
    id: `eq.${customerId}`,
    role: "eq.customer",
    select: CUSTOMER_PROFILE_SELECT,
  });

  return updates[0] || null;
};

export const getScheduledRidesData = async (admin, filters = {}) => {
  const params = {
    limit: Math.min(Number(filters.limit) || 140, 250),
    order: "scheduled_for.asc",
    select: SCHEDULED_RIDE_SELECT,
  };

  if (filters.status && filters.status !== "all") {
    params.status = filters.status.includes(",")
      ? inFilter(filters.status.split(",").map((value) => value.trim()))
      : `eq.${filters.status}`;
  }

  const rows = await safeSelect(() => admin.select("scheduled_rides", params));
  const matchesSearch = buildSearchMatcher(filters.search);

  return rows.filter((ride) => {
    if (!filters.search) {
      return true;
    }

    return [
      ride.id,
      ride.pickup_address,
      ride.destination_address,
      ride.customer?.full_name,
      ride.customer?.phone,
    ].some(matchesSearch);
  });
};

export const cancelScheduledRideAsAdmin = async (admin, scheduledRideId) => {
  const updates = await admin.update(
    "scheduled_rides",
    {
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: `eq.${scheduledRideId}`,
      select: SCHEDULED_RIDE_SELECT,
    },
  );

  return updates[0] || null;
};

export const getFinanceData = async (admin) => {
  const [
    financials,
    payments,
    wallets,
    payouts,
    partnerCommissions,
    partnerPayouts,
    configRows,
  ] = await Promise.all([
    safeSelect(() =>
      admin.select("ride_financials", {
        limit: 60,
        order: "created_at.desc",
        select:
          "id,ride_id,booking_fare_amount,service_fee_amount,partner_fee_amount,customer_total_amount,processor_fee_amount,payout_fee_amount,partner_commission_amount,driver_gross_amount,driver_net_payout_amount,drop_net_margin_amount,currency,created_at,updated_at",
      }),
    ),
    safeSelect(() =>
      admin.select("customer_payments", {
        limit: 60,
        order: "created_at.desc",
        select:
          "id,ride_id,customer_id,amount,currency,payment_method,provider,provider_reference,provider_fee_amount,status,metadata,paid_at,created_at",
      }),
    ),
    safeSelect(() =>
      admin.select("driver_wallets", {
        order: "updated_at.desc",
        select:
          "driver_id,available_balance,pending_balance,auto_withdraw_enabled,auto_withdraw_minimum_amount,created_at,updated_at",
      }),
    ),
    safeSelect(() =>
      admin.select("driver_payouts", {
        limit: 60,
        order: "requested_at.desc",
        select:
          "id,driver_id,payout_account_id,wallet_transaction_id,ride_id,amount,provider,provider_reference,status,failure_reason,requested_at,completed_at",
      }),
    ),
    safeSelect(() =>
      admin.select("partner_commissions", {
        limit: 60,
        order: "created_at.desc",
        select:
          "id,ride_id,partner_id,commission_type,commission_value,commission_amount,status,hold_until,approved_at,paid_at,notes,created_at,updated_at",
      }),
    ),
    safeSelect(() =>
      admin.select("partner_payouts", {
        limit: 40,
        order: "created_at.desc",
        select:
          "id,partner_id,period_start,period_end,gross_commission_amount,adjustment_amount,net_payout_amount,status,reference,paid_at,created_at,updated_at",
      }),
    ),
    admin.select("app_configs", {
      key: "in.(driver_monthly_fee,hybrid_finance_settings)",
      order: "key.asc",
      select: "key,description,value,updated_at",
    }),
  ]);

  const rideIds = toIdList([
    ...financials,
    ...payments,
    ...payouts,
    ...partnerCommissions,
  ], "ride_id");
  const driverIds = toIdList([...wallets, ...payouts], "driver_id");
  const customerIds = toIdList(payments, "customer_id");
  const partnerIds = toIdList([...partnerCommissions, ...partnerPayouts], "partner_id");

  const [rides, drivers, customers, partners] = await Promise.all([
    rideIds.length
      ? admin.select("rides", {
          id: inFilter(rideIds),
          select:
            "id,customer_id,driver_id,partner_id,status,pickup_address,destination_address,price,created_at,completed_at,payment_status,settlement_status",
        })
      : Promise.resolve([]),
    driverIds.length
      ? admin.select("profiles", {
          id: inFilter(driverIds),
          select: "id,full_name,phone,email,is_verified,has_paid",
        })
      : Promise.resolve([]),
    customerIds.length
      ? admin.select("profiles", {
          id: inFilter(customerIds),
          select: "id,full_name,phone,email,is_verified,total_trips",
        })
      : Promise.resolve([]),
    partnerIds.length
      ? admin.select("partners", {
          id: inFilter(partnerIds),
          select:
            "id,name,slug,status,contact_name,contact_email,contact_phone,default_partner_fee_amount,default_commission_type,default_commission_value,payout_schedule,updated_at",
        })
      : Promise.resolve([]),
  ]);

  const rideById = indexBy(rides, "id");
  const driverById = indexBy(drivers, "id");
  const customerById = indexBy(customers, "id");
  const partnerById = indexBy(partners, "id");
  const configMap = mapConfigRows(configRows);

  return {
    configs: {
      driverMonthlyFee: configMap.driver_monthly_fee?.value || null,
      hybridFinanceSettings: configMap.hybrid_finance_settings?.value || null,
    },
    customerPayments: payments.map((payment) => ({
      ...payment,
      customer: customerById.get(payment.customer_id) || null,
      ride: rideById.get(payment.ride_id) || null,
    })),
    driverPayouts: payouts.map((payout) => ({
      ...payout,
      driver: driverById.get(payout.driver_id) || null,
      ride: rideById.get(payout.ride_id) || null,
    })),
    driverWallets: wallets.map((wallet) => ({
      ...wallet,
      driver: driverById.get(wallet.driver_id) || null,
    })),
    partnerCommissions: partnerCommissions.map((commission) => ({
      ...commission,
      partner: partnerById.get(commission.partner_id) || null,
      ride: rideById.get(commission.ride_id) || null,
    })),
    partnerPayouts: partnerPayouts.map((payout) => ({
      ...payout,
      partner: partnerById.get(payout.partner_id) || null,
    })),
    rideFinancials: financials.map((entry) => ({
      ...entry,
      ride: rideById.get(entry.ride_id) || null,
    })),
    totals: {
      pendingPartnerCommissionAmount: sumBy(
        partnerCommissions,
        "commission_amount",
        (entry) => entry.status !== "paid",
      ),
      processingDriverPayoutAmount: sumBy(
        payouts,
        "amount",
        (entry) => entry.status === "queued" || entry.status === "processing",
      ),
      totalAvailableWalletBalance: sumBy(wallets, "available_balance"),
      totalCustomerPaymentsCaptured: sumBy(
        payments,
        "amount",
        (entry) => entry.status === "paid",
      ),
      totalDropNetMarginObserved: sumBy(financials, "drop_net_margin_amount"),
      totalPendingWalletBalance: sumBy(wallets, "pending_balance"),
    },
  };
};

export const getPartnersData = async (admin, filters = {}) => {
  const [partners, members, links, payouts, payoutAccounts, commissions, codes, attributions] =
    await Promise.all([
      safeSelect(() =>
        admin.select("partners", {
          limit: Math.min(Number(filters.limit) || 120, 250),
          order: "updated_at.desc",
          select:
            "id,name,slug,status,contact_name,contact_email,contact_phone,default_partner_fee_amount,default_commission_type,default_commission_value,payout_schedule,metadata,created_at,updated_at",
        }),
      ),
      safeSelect(() =>
        admin.select("partner_members", {
          order: "created_at.desc",
          select: "id,partner_id,auth_user_id,role,created_at",
        }),
      ),
      safeSelect(() =>
        admin.select("partner_customer_links", {
          order: "attributed_at.desc",
          select:
            "id,partner_id,customer_id,attribution_source,source_code,attributed_at,expires_at",
        }),
      ),
      safeSelect(() =>
        admin.select("partner_payouts", {
          order: "created_at.desc",
          select:
            "id,partner_id,period_start,period_end,gross_commission_amount,adjustment_amount,net_payout_amount,status,reference,paid_at,created_at,updated_at",
        }),
      ),
      safeSelect(() =>
        admin.select("partner_payout_accounts", {
          order: "updated_at.desc",
          select:
            "id,partner_id,bank_name,bank_code,account_number,account_name,provider,provider_email,recipient_reference,sub_account_code,settlement_profile_code,settlement_report_emails,is_default,updated_at",
        }),
      ),
      safeSelect(() =>
        admin.select("partner_commissions", {
          order: "created_at.desc",
          select:
            "id,partner_id,ride_id,commission_type,commission_value,commission_amount,status,hold_until,approved_at,paid_at,notes,created_at,updated_at",
        }),
      ),
      safeSelect(() =>
        admin.select("partner_referral_codes", {
          order: "created_at.desc",
          select: "id,partner_id,code,status,created_at",
        }),
      ),
      safeSelect(() =>
        admin.select("ride_partner_attributions", {
          order: "created_at.desc",
          limit: 180,
          select:
            "id,ride_id,partner_id,customer_id,source_code,attribution_source,created_at",
        }),
      ),
    ]);

  const partnerIds = toIdList(partners);
  const customerIds = toIdList(links, "customer_id");
  const [customers] = await Promise.all([
    customerIds.length
      ? admin.select("profiles", {
          id: inFilter(customerIds),
          select: "id,full_name,phone,email,is_verified,total_trips",
        })
      : Promise.resolve([]),
  ]);

  const customerById = indexBy(customers, "id");
  const membersByPartnerId = groupBy(members, "partner_id");
  const linksByPartnerId = groupBy(links, "partner_id");
  const payoutsByPartnerId = groupBy(payouts, "partner_id");
  const payoutAccountsByPartnerId = groupBy(payoutAccounts, "partner_id");
  const commissionsByPartnerId = groupBy(commissions, "partner_id");
  const codesByPartnerId = groupBy(codes, "partner_id");
  const attributionByPartnerId = groupBy(attributions, "partner_id");
  const matchesSearch = buildSearchMatcher(filters.search);

  return partners
    .map((partner) => {
      const partnerLinks = (linksByPartnerId.get(partner.id) || []).map((link) => ({
        ...link,
        customer: customerById.get(link.customer_id) || null,
      }));

      return {
        ...partner,
        active_referral_codes: (codesByPartnerId.get(partner.id) || []).filter(
          (code) => code.status === "active",
        ),
        attribution_count: (attributionByPartnerId.get(partner.id) || []).length,
        commission_due_amount: sumBy(
          commissionsByPartnerId.get(partner.id) || [],
          "commission_amount",
          (entry) => entry.status !== "paid",
        ),
        commissions: sortByDateDesc(commissionsByPartnerId.get(partner.id) || [], "created_at").slice(
          0,
          5,
        ),
        customer_links: partnerLinks,
        members: membersByPartnerId.get(partner.id) || [],
        payout_accounts: payoutAccountsByPartnerId.get(partner.id) || [],
        recent_payouts: sortByDateDesc(payoutsByPartnerId.get(partner.id) || [], "created_at").slice(
          0,
          3,
        ),
        total_customer_links: partnerLinks.length,
      };
    })
    .filter((partner) => {
      if (!filters.search) {
        return true;
      }

      return [
        partner.id,
        partner.name,
        partner.slug,
        partner.contact_email,
        partner.contact_phone,
      ].some(matchesSearch);
    });
};

export const createPartner = async (admin, payload = {}) => {
  const [partner] = await admin.insert("partners", {
    name: payload.name,
    slug: payload.slug,
    status: payload.status || "active",
    contact_name: payload.contact_name || null,
    contact_email: payload.contact_email || null,
    contact_phone: payload.contact_phone || null,
    default_partner_fee_amount: Number(payload.default_partner_fee_amount || 0),
    default_commission_type: payload.default_commission_type || "flat",
    default_commission_value: Number(payload.default_commission_value || 0),
    payout_schedule: payload.payout_schedule || "monthly",
    metadata: payload.metadata || {},
  });

  return partner || null;
};

export const updatePartner = async (admin, partnerId, payload = {}) => {
  const updates = await admin.update(
    "partners",
    {
      updated_at: new Date().toISOString(),
      ...payload,
    },
    {
      id: `eq.${partnerId}`,
      select:
        "id,name,slug,status,contact_name,contact_email,contact_phone,default_partner_fee_amount,default_commission_type,default_commission_value,payout_schedule,metadata,created_at,updated_at",
    },
  );

  return updates[0] || null;
};

export const updatePartnerCommission = async (admin, commissionId, payload = {}) => {
  const nextPayload = {
    updated_at: new Date().toISOString(),
  };

  const allowedFields = ["status", "notes", "approved_at", "paid_at"];
  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      nextPayload[field] = payload[field];
    }
  }

  const updates = await admin.update("partner_commissions", nextPayload, {
    id: `eq.${commissionId}`,
    select:
      "id,partner_id,ride_id,commission_type,commission_value,commission_amount,status,hold_until,approved_at,paid_at,notes,created_at,updated_at",
  });

  return updates[0] || null;
};

export const getSupportData = async (admin, filters = {}) => {
  const [reports, reviews, messages] = await Promise.all([
    admin.select("reports", {
      limit: Math.min(Number(filters.limit) || 120, 250),
      order: "created_at.desc",
      select:
        "id,ride_id,reporter_id,target_id,issue_category,description,status,created_at",
    }),
    admin.select("reviews", {
      limit: 60,
      order: "created_at.desc",
      select:
        "id,ride_id,customer_id,driver_id,rating,comment,reviewer_id,target_id,created_at",
    }),
    admin.select("ride_messages", {
      limit: 120,
      order: "created_at.desc",
      select: "id,ride_id,sender_id,receiver_id,content,image_url,created_at",
    }),
  ]);

  const rideIds = toIdList([...reports, ...reviews, ...messages], "ride_id");
  const profileIds = Array.from(
    new Set([
      ...toIdList([...reports, ...reviews], "reporter_id"),
      ...toIdList(reviews, "reviewer_id"),
      ...toIdList(reviews, "target_id"),
      ...toIdList(messages, "sender_id"),
      ...toIdList(messages, "receiver_id"),
    ]),
  );

  const [rides, profiles] = await Promise.all([
    rideIds.length
      ? admin.select("rides", {
          id: inFilter(rideIds),
          select:
            "id,customer_id,driver_id,status,pickup_address,destination_address,created_at,completed_at,payment_status,payment_follow_up_status",
        })
      : Promise.resolve([]),
    profileIds.length
      ? admin.select("profiles", {
          id: inFilter(profileIds),
          select: "id,full_name,phone,email,role,is_verified,rating,total_trips",
        })
      : Promise.resolve([]),
  ]);

  const rideById = indexBy(rides, "id");
  const profileById = indexBy(profiles, "id");
  const matchesSearch = buildSearchMatcher(filters.search);

  return {
    messages: messages.map((message) => ({
      ...message,
      receiver: profileById.get(message.receiver_id) || null,
      ride: rideById.get(message.ride_id) || null,
      sender: profileById.get(message.sender_id) || null,
    })),
    reports: reports
      .map((report) => ({
        ...report,
        reporter: profileById.get(report.reporter_id) || null,
        ride: rideById.get(report.ride_id) || null,
        target: profileById.get(report.target_id) || null,
      }))
      .filter((report) => {
        if (!filters.search) {
          return true;
        }

        return [
          report.id,
          report.issue_category,
          report.description,
          report.reporter?.full_name,
          report.target?.full_name,
        ].some(matchesSearch);
      }),
    reviews: reviews.map((review) => ({
      ...review,
      reviewer: profileById.get(review.reviewer_id) || null,
      ride: rideById.get(review.ride_id) || null,
      target: profileById.get(review.target_id) || null,
    })),
  };
};

export const updateReport = async (admin, reportId, payload = {}) => {
  const updates = await admin.update(
    "reports",
    {
      status: payload.status,
    },
    {
      id: `eq.${reportId}`,
      select:
        "id,ride_id,reporter_id,target_id,issue_category,description,status,created_at",
    },
  );

  return updates[0] || null;
};

export const sendPushNotification = async (admin, payload = {}) => {
  const { data } = await admin.invokeFunction("send-push-notification", {
    body: {
      body: payload.body,
      channelId: payload.channelId || "trip-alerts",
      data: payload.data || {},
      recipientIds: toArray(payload.recipientIds).filter(Boolean),
      sticky: payload.sticky !== false,
      title: payload.title,
    },
  });

  return data || null;
};

export const getSettingsData = async (admin, config) => {
  const [appConfigs, cancelReasons, serviceTypes, rawDispatchConfigs, dispatchSettings] =
    await Promise.all([
      admin.select("app_configs", {
        order: "key.asc",
        select: "key,description,value,updated_at",
      }),
      admin.select("cancel_reasons", {
        order: ["role.asc", "display_order.asc"],
        select: "id,role,label,value,is_active,display_order",
      }),
      admin.select("service_types", {
        order: "sort_order.asc",
        select:
          "id,name,label,description,is_active,created_at,sort_order,capacity",
      }),
      admin.select("app_dispatch_configs", {
        order: "key.asc",
        select: "key,value,updated_at",
      }),
      getDispatchSettings(admin, config.dispatchAdminToken),
    ]);

  return {
    appConfigs,
    cancelReasons,
    dispatchSettings,
    rawDispatchConfigs,
    serviceTypes,
  };
};

export const updateAppConfig = async (admin, key, payload = {}) => {
  const [configRow] = await admin.upsert(
    "app_configs",
    {
      key,
      description: payload.description || null,
      updated_at: new Date().toISOString(),
      value: payload.value ?? {},
    },
    {
      on_conflict: "key",
      select: "key,description,value,updated_at",
    },
  );

  return configRow || null;
};

const normalizeDispatchPatchPayload = (payload = {}) => {
  const nextPayload = {};

  const fieldMap = {
    driverLocationStaleSeconds: "driverLocationStaleSeconds",
    liveEtaRefreshSeconds: "liveEtaRefreshSeconds",
    maxPickupDistanceM: "maxPickupDistanceM",
    routingCandidateLimit: "routingCandidateLimit",
    routingEnabled: "routingEnabled",
    routingPreference: "routingPreference",
    routingProvider: "routingProvider",
    routingRequestTimeoutMs: "routingRequestTimeoutMs",
  };

  for (const [inputKey, outputKey] of Object.entries(fieldMap)) {
    if (payload[inputKey] !== undefined) {
      nextPayload[outputKey] = payload[inputKey];
    }
  }

  return nextPayload;
};

export const updateDispatchSettings = async (admin, config, payload = {}) => {
  const normalizedPayload = normalizeDispatchPatchPayload(payload);

  if (config.dispatchAdminToken) {
    const { data } = await admin.invokeFunction("dispatch-settings", {
      body: normalizedPayload,
      headers: {
        "x-dispatch-admin-token": config.dispatchAdminToken,
      },
      method: "PATCH",
    });

    return data?.data || null;
  }

  const current = await safeSelectOne(() =>
    admin.selectOne("app_dispatch_configs", {
      key: "eq.defaults",
      select: "key,value,updated_at",
    }),
  );

  const nextValue = {
    ...(current?.value || {}),
  };

  if (payload.maxPickupDistanceM !== undefined) {
    nextValue.max_pickup_distance_m = Number(payload.maxPickupDistanceM);
  }

  if (payload.driverLocationStaleSeconds !== undefined) {
    nextValue.driver_location_stale_seconds = Number(
      payload.driverLocationStaleSeconds,
    );
  }

  if (payload.routingEnabled !== undefined) {
    nextValue.routing_enabled = Boolean(payload.routingEnabled);
  }

  if (payload.routingProvider !== undefined) {
    nextValue.routing_provider = payload.routingProvider;
  }

  if (payload.routingCandidateLimit !== undefined) {
    nextValue.routing_candidate_limit_per_service = Number(
      payload.routingCandidateLimit,
    );
  }

  if (payload.routingRequestTimeoutMs !== undefined) {
    nextValue.routing_request_timeout_ms = Number(payload.routingRequestTimeoutMs);
  }

  if (payload.routingPreference !== undefined) {
    nextValue.routing_preference = payload.routingPreference;
  }

  if (payload.liveEtaRefreshSeconds !== undefined) {
    nextValue.live_eta_refresh_seconds = Number(payload.liveEtaRefreshSeconds);
  }

  const [row] = await admin.upsert(
    "app_dispatch_configs",
    {
      key: "defaults",
      updated_at: new Date().toISOString(),
      value: nextValue,
    },
    {
      on_conflict: "key",
      select: "key,value,updated_at",
    },
  );

  return row?.value || null;
};

export const updateServiceType = async (admin, serviceTypeId, payload = {}) => {
  const updates = await admin.update(
    "service_types",
    {
      ...payload,
    },
    {
      id: `eq.${serviceTypeId}`,
      select:
        "id,name,label,description,is_active,created_at,sort_order,capacity",
    },
  );

  return updates[0] || null;
};

export const createServiceType = async (admin, payload = {}) => {
  const [serviceType] = await admin.insert("service_types", {
    name: payload.name,
    label: payload.label,
    description: payload.description || null,
    is_active: payload.is_active !== false,
    sort_order: Number(payload.sort_order || 0),
    capacity: Number(payload.capacity || 4),
  });

  return serviceType || null;
};

export const updateCancelReason = async (admin, cancelReasonId, payload = {}) => {
  const updates = await admin.update(
    "cancel_reasons",
    {
      ...payload,
    },
    {
      id: `eq.${cancelReasonId}`,
      select: "id,role,label,value,is_active,display_order",
    },
  );

  return updates[0] || null;
};

export const createCancelReason = async (admin, payload = {}) => {
  const [cancelReason] = await admin.insert("cancel_reasons", {
    role: payload.role,
    label: payload.label,
    value: payload.value,
    is_active: payload.is_active !== false,
    display_order: Number(payload.display_order || 0),
  });

  return cancelReason || null;
};
