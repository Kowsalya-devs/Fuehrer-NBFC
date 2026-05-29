const buildUserResponse = (user) => {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    email: user.email,
    kycStatus: user.kycStatus,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

module.exports = { buildUserResponse };
