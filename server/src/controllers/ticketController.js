import prisma from '../config/database.js';

export const getTickets = async (req, res) => {
  try {
    const { status, priority, search, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      userId: req.user.id,
      ...(status && status !== 'all' && { status }),
      ...(priority && priority !== 'all' && { priority }),
      ...(search && {
        OR: [
          { ticketNumber: { contains: search } },
          { subject: { contains: search } },
          { orderReference: { contains: search } },
        ],
      }),
    };

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 1, // Get last message
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.ticket.count({ where }),
    ]);

    res.json({
      tickets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTicket = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await prisma.ticket.findFirst({
      where: {
        id: parseInt(id),
        userId: req.user.id,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(ticket);
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createTicket = async (req, res) => {
  try {
    const { subject, category, priority, orderReference, installationId, message } = req.body;

    // Generate ticket number
    const ticketCount = await prisma.ticket.count();
    const ticketNumber = `TKT-2024-${String(ticketCount + 1).padStart(4, '0')}`;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        userId: req.user.id,
        installationId: installationId ? parseInt(installationId) : null,
        subject,
        category,
        priority: priority || 'medium',
        orderReference,
        status: 'open',
        messages: {
          create: {
            sender: req.user.name,
            senderType: 'client',
            message,
          },
        },
      },
      include: {
        messages: true,
      },
    });

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const addTicketMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, attachments } = req.body;

    // Verify ticket belongs to user
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: parseInt(id),
        userId: req.user.id,
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticketMessage = await prisma.ticketMessage.create({
      data: {
        ticketId: parseInt(id),
        sender: req.user.name,
        senderType: req.user.role === 'admin' ? 'admin' : 'client',
        message,
        attachments: attachments ? JSON.stringify(attachments) : null,
      },
    });

    // Update ticket status if admin responds
    if (req.user.role === 'admin') {
      await prisma.ticket.update({
        where: { id: parseInt(id) },
        data: { status: 'in-progress' },
      });
    }

    res.status(201).json(ticketMessage);
  } catch (error) {
    console.error('Add ticket message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const ticket = await prisma.ticket.update({
      where: {
        id: parseInt(id),
        userId: req.user.id,
      },
      data: updateData,
    });

    res.json(ticket);
  } catch (error) {
    console.error('Update ticket error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

